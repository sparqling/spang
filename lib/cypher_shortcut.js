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
  let cypher = 'MATCH ';

  let node = 'n';
  if (options.n) {
    node += ` ${options.n}`;
  }
  if (options.p) {
    node += ` { ${options.p} }`;
  }

  let where = '';
  if (options.i) {
    where = ` WHERE id(n)=${options.i}`;
  }
  
  let limit = ' LIMIT 10';
  if (options.L) {
    limit = ` LIMIT ${options.L}`;
  }

  let retNode = 'n';
  if (options.R) {
    retNode = options.R.split(',').map(v => {
      return v.includes('.') ? v : `n.${v}`;
    }).join(',');
  }
  retNode += limit;
  if (options.C) {
    retNode = 'COUNT(n)';
  }
  
  if (options.r) {
    cypher += `(n1)-[r:${options.r}]->(n2)`;
    cypher += ' RETURN ';
    if (options.C) {
      cypher += 'COUNT(r)';
    } else {
      if (options.R) {
        const vars1 = options.R.split(',').map(v => `n1.${v}`).join(',');
        const vars2 = options.R.split(',').map(v => `n2.${v}`).join(',');
        cypher += `${vars1},${vars2}`;
      } else {
        cypher += `n1,n2`;
      }
      cypher += limit;
    }
  // } else if (options.G) {
  //   cypher += '(n)-[r]->() RETURN COUNT(r)';
  } else {
    cypher += `(${node})${where} RETURN ${retNode}`;
  }

  cypher = cypher.replace(/\"/g, '\\"').trim();
  
  let json = '{\n';
  json += '  "statements": [\n';
  json += `    { "statement": "${cypher}" }\n`;
  json += '  ]\n'
  json += '}\n'
  return json;
};
