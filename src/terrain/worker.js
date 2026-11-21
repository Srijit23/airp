import { prepareJob } from './generate.js';
self.onmessage = ({ data }) => {
  try {
    const buffers = prepareJob(data);
    self.postMessage(
      { job: data, buffers },
      Object.values(buffers).map((a) => a.buffer),
    );
  } catch (error) {
    self.postMessage({ job: data, error: String(error) });
  }
};
