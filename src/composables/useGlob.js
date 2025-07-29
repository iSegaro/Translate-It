import { glob } from "glob";

export const useGlob = () => {
  const findFiles = async (pattern) => {
    return new Promise((resolve, reject) => {
      glob(pattern, (err, files) => {
        if (err) {
          reject(err);
        } else {
          resolve(files);
        }
      });
    });
  };

  return {
    glob: findFiles,
  };
};
