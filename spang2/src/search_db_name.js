fs = require('fs');

var dbMapPath = `${__dirname}/../etc/endpoints`;
var dbMap;

readDBMap = () => {
  // TODO: error handling
  dbMap = {};
  if(fs.existsSync(dbMapPath)) {
    var contents = fs.readFileSync(dbMapPath, 'utf8');
    contents.split("\n").forEach(line => {
      tokens = line.split(/\s+/);
      if(tokens.length > 1) {
        dbMap[tokens[0]] = {
          url: tokens[1],
          byGet: tokens.length > 2 && tokens[2] == 'get'
        };
      }
    });
  }
}

exports.searchDBName = (dbName) => {
  if(!dbMap) readDBMap();
  var entry = dbMap[dbName]
  if(entry) return [entry.url, entry.byGet];
};

exports.listup = () => {
  if(!dbMap) readDBMap();
  return dbMap;
};
