spang = {};
spang.embed = require('./embed_parameter.js').embedParameter;
spang.request = require('request');
const version = require('../package.json').version;
spang.getTemplate = (url, callback) => {
  var options = {
    uri: url, 
    followAllRedirects: true,
    headers:{ 
      'User-agent': `spang2/spang2_${version}`, 
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

//  const shortcutSparql = spang.shortcut({S: 'uniprot:K9Z723', L: 10});
spang.shortcut = require('./shortcut.js').shortcut
spang.shortcut = spang.shortcut.bind(null, require('./prefix.js').getPrefixMap());
