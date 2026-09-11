'use strict';

const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ESC = String.fromCharCode(27);

function wrap(code) {
  return (str) => (isTTY ? ESC + '[' + code + 'm' + str + ESC + '[0m' : String(str));
}

module.exports = {
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  gray: wrap(90),
  bold: wrap(1),
  underline: wrap(4),
};
