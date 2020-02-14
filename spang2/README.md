# SPANG2

## Installation
```
$ npm install
$ npm link
```

## Usage
```
Usage: spang2 [options] <SPARQL_TEMPLATE>

Options:
  -V, --version                output the version number
  -f, --format <FORMAT>        tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html (default: "tsv")
  -e, --endpoint <ENDPOINT>    target endpoint
  -S, --subject <SUBJECT>      shortcut to specify subject
  -P, --predicate <PREDICATE>  shortcut to specify predicate
  -O, --object <OBJECT>        shortcut to specify object
  -F, --from <FROM>            shortcut to search FROM specific graph (use alone or with -[SPOLN])
  -N, --number                 shortcut of COUNT query (use alone or with -[SPO])
  -G, --graph                  shortcut to search Graph names (use alone or with -[SPO])
  -q, --show_query             show query and quit
  -L, --limit <LIMIT>          LIMIT output (use alone or with -[SPOF])
  -l, --list_nick_name         list up available nicknames and quit
  --param <PARAMS>             parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")
  -h, --help                   output usage information
```
## Test examples
```
$ ./node_modules/mocha/bin/mocha
```
Or, if you have globally installed mocha,

```
$ mocha
```

