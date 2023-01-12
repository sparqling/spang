fs = require('fs');

let dbMap;

const parseDBMap = (text) => {
  text.split('\n').forEach((line) => {
    tokens = line.split(/\s+/);
    if (tokens.length > 1 && !/^ *#/.test(line)) {
      dbMap[tokens[0]] = {
        url: tokens[1],
        byGet: tokens.length > 2 && tokens[2] === 'GET'
      };
    }
  });
};

exports.listup = (opts = null) => {
  let userConfigDir = `${require('os').homedir()}/.spang`;
  if (opts && opts.userConfig) {
    userConfigDir = opts.userConfig;
  }

  if (!dbMap) {
    dbMap = {};
    [`${__dirname}/../etc/endpoints`, `${userConfigDir}/endpoints`].forEach((dbPath) => {
      if (fs.existsSync(dbPath)) {
        parseDBMap(fs.readFileSync(dbPath, 'utf8'));
      }
    });
  }

  return dbMap;
};
