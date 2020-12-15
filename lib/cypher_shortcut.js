formatArgument = (argument) => {
  const urlMatched = argument.match(/^<?(\w+:\/\/[^>]+)>?$/);
  if (urlMatched) {
    return `<${urlMatched[1]}>`;
  } else {
    const prefixMatched = argument.match(/^(\w+):\w+$/);
    if (prefixMatched) {
      return argument;
    } else {
      return `"${argument}"`;
    }
  }
};

exports.shortcut = (options, prefixMap) => {
  let cypher = '';
  if (options.S) {
    if (options.S.includes(':')) {
      cypher = `MATCH (n { ${options.S} }) RETURN `;
    } else if (isNaN(options.S)) {
      cypher = `MATCH (n:${options.S}) RETURN `;
    } else {
      cypher = `MATCH (n) WHERE id(n)=${options.S} RETURN `;
    }
    if (options.N) {
      cypher += 'COUNT(n)';
    } else {
      if (options.P) {
        let vars = options.P;
        vars = vars.split(',').map(v => `n.${v}`).join(',');
        cypher += `${vars} `;
      } else {
        cypher += `n `;
      }
      if (options.L) {
        cypher += `LIMIT ${options.L}`;
      } else {
        cypher += `LIMIT 10`;
      }
    }
  } else if (options.R) {
    cypher = `MATCH (n1)-[r:${options.R}]->(n2) RETURN `;
    if (options.N) {
      cypher += 'COUNT(r) ';
    } else {
      if (options.P) {
        const vars1 = options.P.split(',').map(v => `n1.${v}`).join(',');
        const vars2 = options.P.split(',').map(v => `n2.${v}`).join(',');
        cypher += `${vars1},${vars2} `;
      } else {
        cypher += `n1,n2 `;
      }
      if (options.L) {
        cypher += `LIMIT ${options.L}`;
      } else {
        cypher += `LIMIT 10`;
      }
    }
  } else if (options.F) {
    cypher = `MATCH (n { ${options.F} }) RETURN n`;
  } else if (options.G) {
    cypher = 'MATCH (n)-[r]->() RETURN COUNT(r)';
  } else if (options.N) {
    cypher = 'MATCH (n) RETURN COUNT(n) ';
  } else {
    cypher = 'MATCH (n) RETURN n ';
    if (options.L) {
      cypher += `LIMIT ${options.L}`;
    } else {
      cypher += `LIMIT 10`;
    }
  }

  cypher = cypher.replace(/\"/g, '\\"').trim();
  
  let json = '{\n';
  json += '  "statements": [\n';
  json += `    { "statement": "${cypher}" }\n`;
  json += '  ]\n'
  json += '}\n'
  return json;
};
