spang = {};
spang.embed = require('../lib/embed_parameter.js').embedParameter;
spang.request = require('request');
spang.prefix = require('../lib/prefix.js');
const version = require('../package.json').version;
const syncRequest = require('sync-request');
spang.constructSparql = require('../lib/construct_sparql.js').constructSparql;

spang.getTemplate = (url, callback) => {
  var options = {
    uri: url, 
    followAllRedirects: true,
    headers:{ 
      'User-agent': `SPANG/${version}`, 
      'Accept': 'text/plain'
    }
  };
  spang.request.get(options, function(error, response, body){
    if (!error && response.statusCode == 200) {
      callback(body);
    } else {
      console.log('error: '+ response.statusCode);
      console.log(body);
    }
  });
};

spang.prefix.loadPrefixFileByURL('https://raw.githubusercontent.com/hchiba1/spang2/master/etc/prefix');

spang.shortcut = require('../lib/shortcut.js').shortcut;

bind_trailing_args = (fn, ...bound_args) =>
{
    return function(...args) {
        return fn(...args, ...bound_args);
    };
}

spang.shortcut = bind_trailing_args(spang.shortcut, spang.prefix.getPrefixMap());

spang.query = (sparqlTemplate, endpoint, options, callback) => {
  var sparql, metadata;
  [sparql, metadata] = spang.constructSparql(sparqlTemplate, options.param || '');
  if(!endpoint) {
    endpoint = metadata.endpoint;
  }
  // if (!(/^(http|https):\/\//.test(endpoint))) {
  //   [endpoint, retrieveByGet] = require('./search_db_name.js').searchDBName(endpoint, syncRequest("GET", url).getBody('utf8'));
  // }
  console.log(sparql);
  require('../lib/query_sparql.js')(endpoint, sparql, options.format, options.get, callback);
};
