const request = require('request');

let bodies = [];

module.exports = (endpoint, query, format, auth, callback) => {
  bodies = [];
  queryAll(endpoint, query, format, auth, callback);
};

function queryOnce(endpoint, query, format, auth, callback) {
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
    callback(error, response, body);
  });
}

function queryAll(endpoint, query, format, auth, callback) {
  queryOnce(endpoint, query, format, auth, (error, response, body) => {
    if (error || response.statusCode != 200) {
      callback(error, response.statusCode, bodies);
    } else {
      bodies.push(body);
      callback(false, 200, bodies);
    }
  });
}
