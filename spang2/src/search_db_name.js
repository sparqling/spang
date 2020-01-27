fs = require('fs');

var dbMapPath = `${__dirname}/../etc/endpoints`;
var dbMap;

readDBMap = () => {
  // TODO: error handling
  var contents = fs.readFileSync(dbMapPath, 'utf8');
  dbMap = {};
  contents.split("\n").forEach(line => {
    tokens = line.split(/\s+/);
    dbMap[tokens[0]] = {
      url: tokens[1],
      byGet: tokens.length > 2 && tokens[2] == 'get'
    };
  });
}

exports.searchDBName = (dbName) => {
  if(fs.existsSync(dbMapPath)) {
    if(!dbMap) readDBMap();
    var entry = dbMap[dbName]
    if(entry) return [entry.url, entry.byGet];
  }
};
