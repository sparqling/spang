# Use in command line

## Installation
    $ git clone git@github.com/hchiba1/spang.git
    $ cd spang
    $ npm install
    $ npm link

## Usage
```
SPANG v2.0.0: Specify a SPARQL query (template or shortcut).

Usage: spang2 [options] [SPARQL_TEMPLATE] [par1=val1,par2=val2,...]

Options:
  -e, --endpoint <ENDPOINT>    target SPARQL endpoint (URL or its predifined name in SPANG_DIR/etc/endpoints,~/.spang/endpoints)
  -p, --param <PARAMS>         parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")
  -o, --outfmt <FORMAT>        tsv, json, n-triples (nt), turtle (ttl), rdf/xml (rdfxml), n3, xml, html (default: "tsv")
  -a, --abbr                   abbreviate results using predefined prefixes
  -v, --vars                   variable names are included in output (in the case of tsv format)
  -S, --subject <SUBJECT>      shortcut to specify subject
  -P, --predicate <PREDICATE>  shortcut to specify predicate
  -O, --object <OBJECT>        shortcut to specify object
  -L, --limit <LIMIT>          LIMIT output (use alone or with -[SPOF])
  -F, --from <FROM>            shortcut to search FROM specific graph (use alone or with -[SPOLN])
  -N, --number                 shortcut to COUNT results (use alone or with -[SPO])
  -G, --graph                  shortcut to search for graph names (use alone or with -[SPO])
  -r, --prefix <PREFIX_FILES>  read prefix declarations (default: SPANG_DIR/etc/prefix,~/.spang/prefix)
  -n, --ignore                 ignore user-specific file (~/.spang/prefix) for test purpose
  -m, --method <METHOD>        GET or POST (default: "GET")
  -q, --show_query             show query and quit
  -f, --fmt                    format the query
  -i, --indent <DEPTH>         indent depth; use with --fmt (default: 2)
  -l, --list_nick_name         list up available nicknames of endpoints and quit
  -d, --debug                  debug (output query embedded in URL, or output AST with --fmt)
  --time                       measure time of query execution (exluding construction of query)
  -V, --version                output the version number
  -h, --help                   display help for command
```

## Shotcut mode
Only ten triples are obtained from the target endpoint.
```
spang2 -L 10
```
List of graphs are obtained.
```
spang2 -G
```
To obatain the list of target endpoints,
```
spang2 -l
```

```
spang2 -F http://ddbj.nig.ac.jp/ontologies/taxonomy/ -L 10
```

```
spang2 -S http://ddbj.nig.ac.jp/ontologies/taxonomy/Taxon
```

```
spang2 -O http://ddbj.nig.ac.jp/ontologies/taxonomy/Taxon -L 10
```

```
spang2 -O http://ddbj.nig.ac.jp/ontologies/taxonomy/Taxon -P rdf:type -L 10
```


```
spang2 -O http://ddbj.nig.ac.jp/ontologies/taxonomy/Taxon -P rdf:type -N
```


```
spang -S taxon:Taxon
```


```
spang -S taxon:Taxon -a
```

```
spang2 -S taxon:Taxon -P rdf:type -L10 -a
```

```
spang2 test/tax/count_species.rq -a --param name=Primates
```
