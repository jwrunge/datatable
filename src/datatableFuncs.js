import showdown from "showdown"

function jsonToUrlEncoded(srcjson) {
    if(typeof srcjson !== "object")
        if(typeof console !== "undefined")
            return null

    let urljson = ""
    let keys = Object.keys(srcjson)

    for(let i=0; i < keys.length; i++){
        urljson += encodeURIComponent(keys[i]) + "=" + encodeURIComponent(srcjson[keys[i]])

        if(i < (keys.length-1))
            urljson+="&"
    }
    return urljson;
}

function jsonToXml(obj) {
    var xml = '';
    for(var prop in obj) {
        xml += obj[prop] instanceof Array ? '' : "<" + prop + ">"

        if(obj[prop] instanceof Array) {
            for(let array in obj[prop]) {
                xml += "<" + prop + ">"
                xml += OBJtoXML( new Object( obj[prop][array]) )
                xml += "</" + prop + ">"
            }
        } 
        else if(typeof obj[prop] == "object")
            xml += OBJtoXML( new Object(obj[prop]) )
        else
            xml += obj[prop]

        xml += obj[prop] instanceof Array ? '' : "</" + prop + ">"
    }

    var xml = xml.replace(/<\/?[0-9]{1,}>/g, '')

    return xml
}

function mdToHtml(md) {
    let converter = new showdown.Converter()
    return converter.makeHtml(md)
}


export class DataInterface {
    constructor(dataEditors = null, fetchFunc) {
        this.data = ""              //Data
        this.source = []            //The datatable source; possibly a scoped-in view of jsonData
        this.editorID = 0           //The ID of the editor
        this.editor = {}            //A reference to the editor object (points to external array with ID editorID)
        this.dataScope = []         //The scope map of the data (which element, which property)
        this.metadata = {}          //Information on how to interact with source; the "config" property of a datatable
        this.scopedEditor = {}      //A reference to the editor scoped to dataScope; this is to editor what source is to jsonData
        this.viewHash = ""          //The URL-parsed view portion of the hash
        this.initialized = false    //Flag to track if initialized
        this.fetch = fetchFunc      //Can take a specialized fetch function

        //Initialization
        if(dataEditors) this.initialize(dataEditors)
            .catch(e=> console.log(e))
    }

    initialize(dataEditors, draft = null, user = null) {
        return new Promise((resolve, reject)=> {
            //Determine scope from hash
            this.hashChangeFunc(false)

            //Set up editor
            this.editor = dataEditors.editors[this.editorID]
            if(!this.editor) this.editor = {}
            this.scopedEditor = this.editor.obj

            //Load the source data
            this.loadData(draft, user).then(()=> {
                this.scopeData(false)   //Set up scopedEditor, scoped source, and metadata
                this.initialized = true
                resolve()
            })
            .catch(e=>{
                reject(e)
            })
        })
    }

    //This scopes in the data source, scoped editor, and metadata based on hash URL scope data
    scopeData(resetHash = true, assign = null) {
        //Start at top-scope
        this.source = this.data
        this.scopedEditor = this.editor.obj

        let hashval = this.viewHash + "/" + this.editorID + "/"
        let aggEl = ["root"]
    
        //If we need to scope in any further (dataScope exists), do so
        let i = 0
        for(let el of this.dataScope) {
            if(!el) break
            hashval += el + "/" //Update hash value
            
            //Parse "index-#" properties as array values (convert to Number)
            let origEl = null   //Keep the original property name, though, as we will need it
            if(/index-/.test(el)) {
                origEl = el
                el = Number(el.replace("index-", ""))
            }

            //Scope in the source
            if(assign && i == this.dataScope.length - 1) {
                this.source[el] = assign
                this.source = this.source[el]
            }
            else {
                this.source = this.source[el]
            }

            //Scope in scopedEditor
            if(origEl) {
                if(!this.scopedEditor[origEl]) this.scopedEditor[origEl] = {}
                this.scopedEditor = this.scopedEditor[origEl]
                aggEl.push("[" + el + "]")
            }
            else {
                if(!this.scopedEditor[el]) this.scopedEditor[el] = {}
                this.scopedEditor = this.scopedEditor[el]
                aggEl.push("." + el)
            }

            //Set a scopeId in case we need it
            this.scopedEditor.scopeId = aggEl.join("")

            i++
        }

        //Reflect scope changes in the URL hash
        if(resetHash) window.location.hash = hashval

        //Determine the data mode
        this.scopedEditor.mode = DataInterface.determineMode(this.source)
        
        //Configure metadata information
        this.configMetadata()
    }

    hashChangeFunc(scope = true) {
        //Set hash-based data
        let urlParts = window.location.hash.split("/")
        this.viewHash = urlParts[0]
        this.editorID = Number(urlParts[1]) || 0
        this.dataScope = urlParts.slice(2, urlParts.length)

        for(let i=0; i < this.dataScope.length; i++) {
            if(!this.dataScope[i]) {
                this.dataScope.splice(i, 1)
            }
        }

        if(scope) this.scopeData(false)
    }

    static determineMode(data) {
        let newmode
    
        if(Array.isArray(data)) {
            //Test for props
            let hasProps = false
            if(typeof data[0] !== "string") {
                for(let prop in data[0]) {
                    if(data[0].hasOwnProperty(prop)) {
                        hasProps = true
                        break
                    }
                }
            }
    
            if(hasProps) newmode = 'arrObjs'
            else newmode = 'arr'
        }
        else {
            newmode = 'obj'
        }
    
        return newmode
    }

    configMetadata() {
        let config = {} //Configuration object to apply to metadata
    
        //Add keys to config object, or set a single key "Values"
        if(this.scopedEditor.mode == "arrObjs") {
            for(let col of Object.keys(this.source[0])) {
                config[col] = {}
            }
        }
        else config.Values = {}
            
        //Loop through config keys for settings
        for(let key of Object.keys(config)) {
            //Filter out control keys like "clickable"
            if(["clickable", "addDelete", "editas", "editable", "showas", "rearrange", "mode"].includes(key))
                continue
    
            //Make sure scopedEditor shares keys with metadata
            if(!this.scopedEditor[key]) this.scopedEditor[key] = {}
    
            //Apply control key values to this scope
            config[key].rearrangeable = this.scopedEditor.rearrange
            config[key].clickable = this.scopedEditor[key].clickable ? "drill" : false
            config[key].alias = this.scopedEditor[key].alias || ""
    
            if(this.scopedEditor[key].editable)
                config[key].editable = {
                    type: this.scopedEditor[key].editas || "text"
                }
            else {
                config[key].editable = false
            }
        }
            
        this.metadata = config  //Apply
    }

    //Function to return a link based on the supplied scope up through key i
    static getAggregatedLink(scope, i) {
        let scopeToI = scope.slice(0, i)        
        return scopeToI.join("/") + "/"
    }

    setFetchFunc(func) {
        this.fetch = func
    }

    //Data loader returns promise so we can conditionally do other things in data editor pages
    async loadData(draft = null, user = null) {
        if(!this.fetch) {
            this.fetch = async (url, options) => {
                return await fetch(url, options)
            }
        }

        return new Promise((resolve, reject)=> {
            let filepath 
            if(draft && draft != "New Draft (live)" && user) {
                filepath = "hammock/datadrafts/" + this.editor.name + "/" + user + "/" + draft + "/hmkEditorRecord.json"
            }
            else if(this.editor.sourceType == "text") filepath = this.editor.textsource
            else if(this.editor.sourceType == "html") filepath = this.editor.htmlsource
            else if(this.editor.sourceType == "md") filepath = this.editor.mdsource
            else filepath = this.editor.jsonsource

            if(this.editor.sourceType == "json") {
                this.fetch("/hmk-api/getFile", {
                    body: JSON.stringify({
                        filepath
                    })
                })
                .then(res=> res.json())
                .then(data=> {
                    this.data = data
                    resolve()
                })
                .catch(err=> {
                    reject(err)
                })
            }
            else if(this.editor.sourceType == "api") {
                let encoding = (()=> {
                    switch(this.editor.apiencoding) {
                        case "plain": 
                            return "text/plain"
                        case "html":
                            return "text/html"
                        case "xml":
                            return "application/xml"
                        case "json":
                            return "application/json"
                        case "form":
                            return "multipart/form-data"
                        case "url":
                            return "application/x-www-form-urlencoded"
                    }
                })()

                let headers = new Headers({
                    "Content-Type": encoding
                })

                let urlencoded = encoding === "application/x-www-form-urlencoded"
                //fetch(this.editor.apisource  + urlencoded ? jsonToUrlEncoded(this.data) : "", {
                fetch(this.editor.apisource, {
                    method: this.editor.apimethod,
                    headers,
                    body: urlencoded || !this.editor.apiSourceParams.length ? null : JSON.stringify(
                        this.editor.apiSourceParams
                    )
                })
                .then(res=> res.json())
                .then(data=> {
                    this.data = data
                    resolve()
                })
                .catch(err=> {
                    reject(err)
                })
            }
            else if(["html", "text", "md"].includes(this.editor.sourceType)) {
                this.fetch("/hmk-api/getFile", {
                    body: JSON.stringify({
                        filepath
                    })
                })
                .then(res=> res.text())
                .then(data=> {
                    if(this.editor.sourceType == "md") this.data = mdToHtml(data)
                    else this.data = data
                    resolve()
                })
                .catch(err=> {
                    this.data = ""
                    reject(err)
                })
            }
        })
    }

    updateSubLevel(data) {
        this.scopeData(false, data)
    }

    handleFieldClick(e) {
        if(e.detail.index)
            this.dataScope.push("index-" + e.detail.index)
        if(e.detail.field) this.dataScope.push(e.detail.field)

        this.scopeData()
    }

    nullInterface() {
        this.data = []
        this.editor = {}
        this.initialized = false
    }
}