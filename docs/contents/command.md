# Command line usage

## Installation
    $ git clone git@github.com/hchiba1/spang.git
    $ cd spang
    $ npm install
    $ npm link

## Usage
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
      -a, --abbr                   abbreviate results using predefined prefixes
      -q, --show_query             show query and quit
      -L, --limit <LIMIT>          LIMIT output (use alone or with -[SPOF])
      -l, --list_nick_name         list up available nicknames and quit
      --param <PARAMS>             parameters to be embedded (in the form of "--param par1=val1,par2=val2,...")
      -h, --help                   output usage information

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
