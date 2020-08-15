# Use in JavaScript

* Download `spfmt_bundled.js` and use it in your HTML.

```
<script src="/js/spfmt_bundled.js"></script>
```

* Then you can use `spfmt.reformat`.
```javascript
spfmt.reformat("SELECT * WHERE {?s ?p ?o}");
/*
SELECT *
WHERE {
    ?s ?p ?o .
}
*/
```

* You can also call `spfmt_bundled.js` through the jsDelivr service.
```
    <textarea id="sparql-text" rows=5></textarea>
    <button id="reformat-button">Reformat</button>
    <textarea id="sparql-text-after" rows=5></textarea>
    
    <script src="https://cdn.jsdelivr.net/gh/hchiba1/spang@master/js/spfmt_bundled.js"></script>  
    <script type="text/javascript">
     window.onload = () => {
         var textArea = 
             document.querySelector("#reformat-button").addEventListener('click', (event) => {
                 document.querySelector("#sparql-text-after").value =
                     spfmt.reformat(document.querySelector("#sparql-text").value);
             });
     };
    </script>
```
