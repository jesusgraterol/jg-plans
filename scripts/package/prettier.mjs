import manifest from '../../package.json' with { type: 'json' };

// package formatting shares repository style without website plugins or stylesheet inputs
const options = { ...manifest.prettier };
delete options.plugins;
delete options.tailwindStylesheet;

export default options;
