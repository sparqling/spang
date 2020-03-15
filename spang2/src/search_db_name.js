fs = require('fs');

var dbMapPath = `${__dirname}/../etc/endpoints`;
var dbMap;

readDBMap = (src=null) => {
  // TODO: error handling
  dbMap = {};
  if(!src && fs.existsSync(dbMapPath)) {
    src = fs.readFileSync(dbMapPath, 'utf8');
  }
  src.split("\n").forEach(line => {
    tokens = line.split(/\s+/);
    if(tokens.length > 1 && !/^ *#/.test(line)) {
      dbMap[tokens[0]] = {
        url: tokens[1],
        byGet: tokens.length <= 2 || tokens[2] != 'POST'
      };
    }
  });
}

exports.searchDBName = (dbName, src=null) => {
  if(!dbMap || src) readDBMap(src);
  var entry = dbMap[dbName]
  if(entry) return [entry.url, entry.byGet];
};

exports.listup = () => {
  if(!dbMap) readDBMap();
  return dbMap;
};
