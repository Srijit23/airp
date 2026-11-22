"""Rebuild the Kenney GLBs from the four extracted CC0 kits. Requires Pillow.
Usage: python scripts/import-city-models.py /path/to/extracted-kits
Look under each kit's Models/OBJ format directory. Outputs are repository-local.
"""
import gzip
import json
import struct
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
DEST = ROOT / 'assets/models'
DEST.mkdir(parents=True, exist_ok=True)
catalog_path = ROOT / 'src/places/catalog.json'
catalog = {k:v for k,v in json.loads(catalog_path.read_text()).items() if v['kit']=='landmarks'}
kits = {
    'homes': ('city-kit-suburban','building-type-*'),
    'city': ('city-kit-commercial','building-*'),
    'works': ('city-kit-industrial','building-*'),
    'garden': ('nature-kit',['tree_palmDetailedTall','plant_bushDetailed','grass_leafsLarge','rock_largeA','plant_flatTall'])
}

def surface(kit, rgb, name, variant):
    r,g,b=rgb
    if kit=='garden':
        if 'wood' in name.lower(): return (99,84,65),0
        if 'stone' in name.lower() or 'rock' in name.lower(): return (128,126,111),0
        return ((73,101,51) if 'dark' in name.lower() else (103,129,67)),5
    if b>r+48 and b>g+18: return (58,82,91),3
    if g>r+34 and g>b+12:
        if kit=='homes': return [(148,91,68),(103,101,91),(127,78,57),(83,92,96)][variant%4],2
        return (61,101,95),0
    if r>b+30: return ((134,82,56) if kit=='homes' else (164,111,73)),0
    if r>178: return (min(220,r*.85+12),min(215,g*.81+13),min(205,b*.72+13)),0
    if r<87: return (r*.87,g*.87,b*.8),0
    walls=([(187,168,143),(203,195,174),(149,135,114),(193,159,134)] if kit=='homes' else
           [(157,151,137),(163,165,156),(144,132,116),(167,156,149)])
    return tuple(x*(.72+r/425) for x in walls[variant%4]), 4 if kit=='works' else 1

def import_obj(path,kit,variant):
    pos,norm,uv,verts,faces=[],[],[],[],[]
    keys={};material=''
    tex=path.parent/'Textures/colormap.png'
    image=Image.open(tex).convert('RGB') if tex.exists() else None
    for line in path.read_text().splitlines():
        a=line.split()
        if not a: continue
        if a[0]=='v':pos.append(tuple(map(float,a[1:4])))
        if a[0]=='vn':norm.append(tuple(map(float,a[1:4])))
        if a[0]=='vt':uv.append(tuple(map(float,a[1:3])))
        if a[0]=='usemtl':material=a[1]
        if a[0]!='f':continue
        indices=[]
        for ref in a[1:]:
            key=(ref,material)
            if key not in keys:
                i,j,k=(ref+'//').split('/')[:3]
                x,y,z=pos[int(i)-1];nx,ny,nz=norm[int(k)-1];rgb=(128,128,128)
                if image and j:
                    u,v=uv[int(j)-1]
                    rgb=image.getpixel((min(image.width-1,int(u*image.width)),min(image.height-1,int((1-v)*image.height))))
                color,kind=surface(kit,rgb,material,variant)
                keys[key]=len(verts)
                verts.append(((-x,y,-z),(-nx,ny,-nz),tuple(round(255*((c/255+.055)/1.055)**2.4) for c in color),kind))
            indices.append(keys[key])
        for j in range(1,len(indices)-1):faces.extend([indices[0],indices[j],indices[j+1]])
    lo=list(map(min,zip(*(v[0] for v in verts))));hi=list(map(max,zip(*(v[0] for v in verts))))
    origin=[(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]
    return [(tuple(p[i]-origin[i] for i in range(3)),n,c,s) for p,n,c,s in verts],faces,[round(b-a,6) for a,b in zip(lo,hi)]

def distant(vertices,indices,size):
    grid=[max(.001,v/12) for v in size];points={};reduced=[];remap=[]
    for pos,normal,color,kind in vertices:
        xyz=tuple(round(t/q) for t,q in zip(pos,grid));axis=max(range(3),key=lambda i:abs(normal[i]))
        key=(xyz,axis,normal[axis]>0,kind)
        if key not in points:
            points[key]=len(reduced);reduced.append((tuple(t*q for t,q in zip(xyz,grid)),normal,color,kind))
        remap.append(points[key])
    out=[];seen=set()
    for a,b,c in zip(indices[::3],indices[1::3],indices[2::3]):
        i,j,k=remap[a],remap[b],remap[c];coords=[reduced[v][0] for v in (i,j,k)]
        if len(set(coords))<3:continue
        key=tuple(sorted((i,j,k)))
        if key not in seen:out.extend((i,j,k));seen.add(key)
    return reduced,out

def pack(kit,paths):
    data=bytearray()
    g={'asset':{'version':'2.0','generator':'AIRP architectural import'},'scene':0,'scenes':[{'nodes':[]}],
       'nodes':[],'meshes':[],'buffers':[],'bufferViews':[],'accessors':[]}
    def add(rows,fmt,dtype,kind,normalized=False,bounds=False):
        while len(data)%4:data.append(0)
        start=len(data)
        for row in rows:data.extend(struct.pack('<'+fmt,*row))
        g['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(data)-start})
        acc={'bufferView':len(g['bufferViews'])-1,'componentType':dtype,'count':len(rows),'type':kind}
        if normalized:acc['normalized']=True
        if bounds:acc['min']=list(map(min,zip(*rows)));acc['max']=list(map(max,zip(*rows)))
        g['accessors'].append(acc);return len(g['accessors'])-1
    for j,path in enumerate(paths):
        verts,faces,size=import_obj(path,kit,j)
        name=kit+'_'+path.stem.replace('building-type-','').replace('building-','').replace('-','_')
        catalog[name]={'kit':kit,'size':size};parts=[(name,verts,faces)]
        if kit!='garden':parts.append((name+'_lod',*distant(verts,faces,size)))
        for part,vs,fs in parts:
            p,n,c,s=zip(*vs)
            attrs={'POSITION':add(p,'3f',5126,'VEC3',bounds=True),'NORMAL':add(n,'3f',5126,'VEC3'),
                   'COLOR_0':add(c,'3B',5121,'VEC3',True),'_SURFACE':add([(v,) for v in s],'f',5126,'SCALAR')}
            g['meshes'].append({'name':part,'primitives':[{'attributes':attrs,'indices':add([(v,) for v in fs],'H',5123,'SCALAR')}]})
            g['nodes'].append({'mesh':len(g['meshes'])-1,'name':part});g['scenes'][0]['nodes'].append(len(g['nodes'])-1)
    while len(data)%4:data.append(0)
    g['buffers']=[{'byteLength':len(data)}];header=json.dumps(g,separators=(',',':')).encode();header+=b' '*(-len(header)%4)
    glb=struct.pack('<4sIIII',b'glTF',2,28+len(header)+len(data),len(header),0x4e4f534a)+header+struct.pack('<II',len(data),0x004e4942)+data
    (DEST/(kit+'.glb.gz')).write_bytes(gzip.compress(glb,compresslevel=9,mtime=0))

for kit,(folder,names) in kits.items():
    base=SOURCE/folder/'Models/OBJ format'
    paths=sorted(base.glob(names+'.obj')) if isinstance(names,str) else [base/(n+'.obj') for n in names]
    if not paths:raise ValueError('No models found under '+str(base))
    pack(kit,paths)
catalog_path.write_text(json.dumps(catalog,sort_keys=True,indent=2)+'\n')
