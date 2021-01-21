const request = require('request');

module.exports = (endpoint, query, format, auth, callback) => {
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
      callback(error, response.statusCode, body);
    } else {
      callback(false, 200, body);
    }
  });
};
