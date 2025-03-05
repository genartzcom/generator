const prettier = require('prettier/standalone');
const solidityPlugin = require('prettier-plugin-solidity/standalone');

exports.formatSolidity = async function (code) {
  return await prettier.format(code, {
    parser: 'solidity-parse',
    plugins: [solidityPlugin],
  });
};

exports.formatYaml = async function (code) {
  return await prettier.format(code, {
    parser: 'yaml'
  });
};