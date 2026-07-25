const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAndroidLocalModel = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const modelSource = path.join(projectRoot, 'local_models', 'llama-3.2-1b-instruct-q4_k_m.gguf');
      const assetsDest = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'llama-3.2-1b-instruct-q4_k_m.gguf');

      if (fs.existsSync(modelSource)) {
        console.log(`[FRIDAY] Injecting local model into Android assets...`);
        const assetsDir = path.dirname(assetsDest);
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }
        // Copy using stream to handle 1.5GB safely on the build server
        fs.copyFileSync(modelSource, assetsDest);
        console.log(`[FRIDAY] Local model injected successfully.`);
      } else {
        console.warn(`[FRIDAY] Local model NOT found at ${modelSource}. Skipping injection.`);
      }
      return config;
    },
  ]);
};

module.exports = (config) => withPlugins(config, [withAndroidLocalModel]);
