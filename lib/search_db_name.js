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
  if (dbMap) {
    return dbMap;
  }

  dbMap = {};

  if (opts.ignoreAllConfig) {
    return dbMap;
  }

  let dbLists = [`${__dirname}/../etc/endpoints`];
  if (!opts.ignoreUserConfig) {
    let userConfigDir = `${require('os').homedir()}/.spang`;
    if (opts && opts.userConfig) {
      userConfigDir = opts.userConfig;
    }
    dbLists.push(`${userConfigDir}/endpoints`);
  }

  dbLists.forEach((dbList) => {
    if (fs.existsSync(dbList)) {
      parseDBMap(fs.readFileSync(dbList, 'utf8'));
    }
  });

  return dbMap;
};
