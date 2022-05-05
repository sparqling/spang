const axios = require('axios');
const version = require('../package.json').version;
const acceptHeaderMap = {
  "xml"      : "application/sparql-results+xml",
  "json"     : "application/sparql-results+json",
  "tsv"      : "application/sparql-results+json", // receive as json and format to tsv afterward
  "text"     : "text/tab-separated-values",
  "csv"      : "text/csv",
  "n-triples": "text/plain",
  "nt"       : "text/plain",
  "n3"       : "text/rdf+n3",
  "html"     : "text/html",
  "bool"     : "text/boolean",
  "turtle"   : "application/x-turtle",
  "ttl"      : "application/x-turtle",
  "rdf/xml"  : "application/rdf+xml",
  "rdfxml"   : "application/rdf+xml",
  "rdfjson"  : "application/rdf+json",
  "rdfbin"   : "application/x-binary-rdf",
  "rdfbint"  : "application/x-binary-rdf-results-table",
  "js"       : "application/javascript",
};

module.exports = (endpoint, proxy, query, format, byGet, callback) => {
  queryAll(endpoint, proxy, query, format, byGet, 0, 0, [], callback);
};

async function queryOnce(endpoint, proxy, query, format, byGet, afterQueryOnce) {
  const accept = acceptHeaderMap[format];
  const headers = {
    'User-agent': `SPANG/${version}`,
    Accept: accept
  };
  let requestParams = new URLSearchParams({ 'query': query });
  if (proxy) {
    requestParams.endpoint = endpoint;
  }
  try {
    let response;
    if (byGet) {
      response = await axios.get(proxy ? proxy : endpoint, { params: requestParams, headers: headers });
    } else {
      response = await axios.post(proxy ? proxy : endpoint, requestParams, { headers: headers });
    }
    let maxrows = null;
    if (response && response.headers) {
      maxrows = response.headers['x-sparql-maxrows'];
    }
    let body;
    if (format === 'json' || format === 'tsv') {
      body = JSON.stringify(response.data, null, 2);
    } else{
      body = response.data;
    }
    afterQueryOnce(maxrows, body);
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error(`${err.code} ${err.syscall} ${err.address}:${err.port}`);
    } else {
      console.error(err.response.status + ' ' + err.response.statusText);
    }
  }
}

function queryAll(endpoint, proxy, query, format, byGet, currentOffset, pageSize, bodies, callbackMain) {
  let currentQuery = query;
  if (pageSize > 0) {
    currentQuery += ` LIMIT ${pageSize}`;
  }
  if (currentOffset > 0) {
    currentQuery += ` OFFSET ${currentOffset}`;
  }
  queryOnce(endpoint, proxy, currentQuery, format, byGet, (maxrows, body) => {
    bodies.push(body);
    if (maxrows) {
      maxrows = parseInt(maxrows);
      console.error(`Querying with OFFSET ${currentOffset + maxrows} LIMIT ${maxrows}`);
      queryAll(endpoint, proxy, query, format, byGet, currentOffset + maxrows, maxrows, bodies, callback);
    } else {
      callbackMain(bodies);
    }
  });
}
