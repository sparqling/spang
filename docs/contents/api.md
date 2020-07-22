# SPANG API
We developed a SPANG library API to search for the set of SPARQL queries.
SPANG library is accessible through SPANG Web API.
The following command returns the list of libraries.
```
curl https://spang-portal.dbcls.jp/api/library
```
The results is shown below as JSON format.
```
[
  {
    "name": "disgenet",
    "title": "DisGeNET",
    "description": "DisGeNET",
    "endpoint": "http://rdf.disgenet.org/sparql/",
    "schema": "http://www.disgenet.org/web/DisGeNET/menu/rdf#schema",
    "uri": "http://localhost:7070/api/library/disgenet",
    "count": 14
  },
  {
    "name": "wikipathways",
    "title": "WikiPathways",
    "description": "WikiPathways",
    "endpoint": "http://sparql.wikipathways.org/",
    "schema": null,
    "uri": "http://localhost:7070/api/library/wikipathways",
    "count": 6
  },
  ...
]
```

The following command returns the list of query in a library.

```
curl https://spang-portal.dbcls.jp/api/library/disgenet
```
The results is shown in below as JSON format.
```
{
  "disgenet": [
    {
      "name": "disease_gene",
      "title": "Get UniProt IDs for a specific disease, e.g. C0751955 (\"Brain Infarction\")",
      "uri": "http://localhost:7070/api/disgenet/disease_gene",
      "endpoint": "http://rdf.disgenet.org/sparql/",
      "param": [
        {
          "name": "arg1",
          "default": "C0751955"
        }
      ]
    },
    {
      "name": "disease_uniprot",
      "title": "Get UniProt IDs for a specific disease, e.g. C0751955 (\"Brain Infarction\")",
      "uri": "http://localhost:7070/api/disgenet/disease_uniprot",
      "endpoint": "http://rdf.disgenet.org/sparql/",
      "param": [
        {
          "name": "arg1",
          "default": "C0751955"
        }
      ]
    },
    {
      "name": "gda_alzheimer",
      "title": "Alzheimer's disease-related genes with curated evidences",
      "uri": "http://localhost:7070/api/disgenet/gda_alzheimer",
      "endpoint": "http://rdf.disgenet.org/sparql/",
      "param": [

      ]
    },
    {
      "name": "gda_evidence",
      "title": "Get specific gda, e.g. NCBI gene ID 4204 and C0035372(\"Rett Syndrome\")",
      "uri": "http://localhost:7070/api/disgenet/gda_evidence",
      "endpoint": "http://rdf.disgenet.org/sparql/",
      "param": [

      ]
    },
    ...
  ]
}
```

The following command searches for queries with keywords.
```
curl https://spang-portal.dbcls.jp/api/search?keyword=gene
```

Using SPANG API, users can execute SPARQL query over the Web, with the given parameters.

The following command returns the result of the query, with the given parameter.
```
curl https://spang-portal.dbcls.jp/api/library/disgenet/gene\_disease.rq?arg1=678
```
