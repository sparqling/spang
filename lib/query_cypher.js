const request = require('request');

module.exports = (endpoint, query, auth, callback) => {
  const options = {
    uri: endpoint,
    followAllRedirects: true,
    headers: {
      'Content-type': 'application/json'
    },
    body: query
  };
  if (auth.hasOwnProperty('user') && auth.hasOwnProperty('password')) {
    options.auth = auth;
  }

  request.post(options, (error, response, body) => {
    if (error !== null) {
      console.error(error);
      return false;
    }
    if (error || response.statusCode != 200) {
      console.error('Error: ' + response.statusCode);
      console.error(body);
    } else {
      callback(body);
    }
  });
};
