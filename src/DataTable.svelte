<script>
    import {onMount, createEventDispatcher, afterUpdate, beforeUpdate} from "svelte"
    import Fuse from "fuse.js"
    import Modal from "./Modal.svelte"
    import DataTableValue from "./DataTableValue.svelte"
    import {slide, fade} from "svelte/transition"
    // import {DataInterface} from "./datatableFuncs.js"

    const dispatch = createEventDispatcher()

    //Prevent multiple redraws/resorts
    let reSortTimer = null
    let setupConfigTimer = null
    let initialLoad = false
    let initialSearch = false

    //Parameters
    export let sourceData
    let tableData
    
    export let metadata = {}
    let meta = {
        tableHeadHtml: "",
        responsiveType: "stack",
        limitHeight: false,
        maxHeight: null,
        displayOnly: false,
        tableWidth: "100%",
        tableMinWidth: "none",
        tableMaxWidth: "none",
        maxResultsPerPage: 0
    }

    export let processing = {}
    let dataInterface = {
        configuration: null,
        addedColumns: null,
        autoEditable: false,
        autoClickable: false,
        autoSearchable: false,
        noDataNote: "No data present",
        sortable: true
    }

    export let interactivity = {}
    let controls = {
        hideAll: false,
        hideAddButton: false,
        hideDeleteButton: false,
        hideFilterButton: false,
        hideCheckboxes: false,
        overrideAddModal: false,
        overrideFilterModal: false,
        overrideDeleteModal: false,
        overrideColumnsModal: false,
        customMenu: false
    }

    export let exports = {
        strResults: "",
    }

    export let columnsModalOpen = false
    export let row_class = []

    export let diagnostics = {
        logStages: false
    } 

    export let customButtons = []

    let keyStructure = []
    let searchFields = []
    let noFilterFields = []
    let config = {}
    let customMenuOpen = false

    //Refs
    let datatable
    let topcheckboxChecked = false
    
    let searchTimeout
    let tableTooBig = false  //Sets classes based on dynamic breakpoint
    let breakpoint = 0
    let selectedRows = []    //Rows selected by checkbox (logs row indices)
    let currentRecordOffset = 0
    let filteredMaxResults = 0

    //Sorting, searching, filtering
    let sortBy = "none"
    let sortOrder = "asc"
    let searchValue = ""
    let filters = []

    //Modals
    let filterModalOpen = false
    let deleteModalOpen = false
    let messageModal = {
        open: false,
        header: "No message",
        message: "No message was sent"
    }
    let propAddModalOpen = false
    let newPropVal
    let mode

    //Computed
    let sortedData
    let numSelectedRows = 0
    let column_categories = []

    //Watch
    // $: sourceData, handleTableDataChange()
    $: tableData, reSort("table data change")
    $: processing || sourceData, reInitializeTable()
    $: searchValue, searchChange()
    $: topcheckboxChecked, selectAllRows()
    $: selectedRows, calcSelectedRows()
    $: metadata, (()=> {
        meta = {...meta, ...metadata}
    })()

    beforeUpdate(()=> {
        dispatch("beforeUpdate")
    })

    afterUpdate(()=> {
        dispatch("afterUpdate")
    })

    //Functions
    function determineMode(data) {
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

    function reSetupConfig() {
        if(!initialLoad) return

        if(setupConfigTimer) clearTimeout(setupConfigTimer)
        setupConfigTimer = setTimeout(()=> {
            if(diagnostics.logStages) {
                console.group("Setup config")
                console.log("Started - " + Date.now())
                console.time("Setup config")
            }
            setupConfig()
        }, 100)
    }

    function setupConfig() {
        //Set search fields and no filter fields
        searchFields = []
        noFilterFields = []
        keyStructure = []

        //Set mode
        mode = determineMode(tableData)
        
        //Set variables based on config value
        if(!dataInterface.configuration) {
            config = {}
            let initValue = {}

            if(!dataInterface.autoEditable, !dataInterface.autoSearchable, !dataInterface.autoClickable)
                initValue = true
            else {
                if(dataInterface.autoEditable) initValue.editable = { type: "text" }
                if(dataInterface.autoSearchable) initValue.searchable = true
                if(dataInterface.autoClickable) initValue.clickable = dataInterface.autoClickable
            }

            if(mode == 'arrObjs') {
                for(let key in tableData[0]) {
                    keyStructure.push(key)
                    config[key] = initValue
                    if(dataInterface.autoSearchable) searchFields.push(key)
                }
            }
            else if(mode == 'arr') {
                keyStructure.push("Values")
                config["Values"] = initValue
                if(dataInterface.autoSearchable) searchFields.push("Values")
            }
            else if(mode == 'obj') {
                keyStructure.push("Values")
                config["Values"] = initValue
                if(dataInterface.autoSearchable) searchFields.push("Values")
            }
        } else { //If the configuration data was set
            config = dataInterface.configuration
            for(let i=0; i<Object.keys(config).length; i++) {
                let key = Object.keys(config)[i]
                let val = config[key]

                if(val.searchable) searchFields.push(key)
                if(val.filter === false) noFilterFields.push(key)
                keyStructure.push(key)

                // if(mode != "arrObjs") break
            }
        }

        //Construct column_categories
        column_categories = []
        for(let key of Object.keys(config)) {
            let cat = config[key] && config[key].category ? config[key].category : "Required"
            if(config[key] === true) {
                config[key] = { category: "Required", enabled: true }
            }
            if(config[key] && config[key].category && !config[key].category !== false) config[key].category = "Required"
            if(config[key] && config[key].enabled !== false) config[key].enabled = true

            if(cat && !column_categories.includes(cat)) column_categories.push(cat)
        }

        if(keyStructure.length > 1) mode = "arrObjs"

        if(diagnostics.logStages) {
            console.log("%cEnded - " + Date.now(), "color: lightblue; background: blue; font-weight: bold;")
            console.timeEnd("Setup config")
            console.groupEnd("Setup config")
        }
    }

    function calcSelectedRows() {
        if(!sortedData) {
            exports.strResults = ""
            return
        }

        let accum = 0
        for(let i=0; i<selectedRows.length; i++) { 
            if(selectedRows[i]==true) 
                accum++ 
        }
        numSelectedRows = accum

        let label = sortedData.length == 1 ? "result" : "results"
        if(numSelectedRows > 0) {         
            exports.strResults = `${sortedData.length} ${label} (${numSelectedRows} selected)`
        }
        else exports.strResults = `${sortedData.length} ${label}`

        returnSelected()
    }

    function calcAddedColumns(tempData) {
        if(dataInterface.addedColumns) {
            for(let column of dataInterface.addedColumns) {
                //Check if we really need to calculate
                if(config[column.colName] && config[column.colName].enabled === false) continue

                for(let i=0; i < tempData.length; i++) {
                    tempData[i][column.colName] = (()=> {
                        //Vars
                        let row = tempData[i]
                        let index = tempData[i].hmkIndex

                        //Row and index are used in eval
                        let returnval
                        if(column.value) returnval = column.value
                        else if(column.eval) {
                            returnval = Function(`'use strict'; let row = ${JSON.stringify(row)}; let index = ${index}; return (${column.eval})`)()
                        }
                        else if(column.func) {
                            returnval = column.func(row, index)
                        }
                        else returnval = ""

                        return returnval
                    })()
                }
            }

        }

        return tempData
    }

    function reSort(origin = "unknown origin") {
        if(!initialLoad) return

        if(reSortTimer) clearTimeout(reSortTimer)
        reSortTimer = setTimeout(()=> {
            if(diagnostics.logStages) {
                console.group("Sort")
                console.log("Sort called from " + origin)
                console.log("Started - " + Date.now())
                console.time("Sort duration")
            }
            getSortedData()
        }, 100)
    }

    function getSortedData() {
        //Sort timer begins from calling function

        dispatch("beginsort")

        if(!tableData || tableData.length == 0) {
            sortedData = []
            if(diagnostics.logStages) {
                console.log("%cAborted - " + Date.now(), "color: pink; font-weight: bold; background: red;")
                console.timeEnd("Sort duration")
                console.groupEnd("Sort")
            }
            return
        }

        selectedRows = []
        
        //Avoid mutating the array by copying it (if it's an array!)
        if(diagnostics.logStages) console.time("Copy temp data")
        let tempData = []
        if(mode != "obj")
            tempData = JSON.parse(JSON.stringify(tableData))
        else {
            let index = 0
            for(let key of Object.keys(tableData)) {
                tempData.push({
                    key,
                    value: tableData[key],
                    hmkIndex: index
                })
                index++
            }
        }
        if(diagnostics.logStages) console.timeEnd("Copy temp data")

        //Handle array
        if(mode == "arr") {
            if(diagnostics.logStages) console.time("Array - adding original indices")
            //Assign indices to correspond with tableData
            tempData = tempData.map((row, index)=> {
                return {value: row, hmkIndex: index}
            })
            if(diagnostics.logStages) console.timeEnd("Array - adding original indices")
        }

        //Handle array of objects
        if(mode == "arrObjs") {
            if(diagnostics.logStages) console.time("Array of obj - adding original indices")
            //Assign indices to correspond with tableData
            tempData = tempData.map((row, index)=> {
                return {...row, hmkIndex: index}
            })
            if(diagnostics.logStages) console.timeEnd("Array of obj - adding original indices")

            if(diagnostics.logStages) console.time("Array of obj - calculating added columns")
            //If we are adding columns, do it now
            calcAddedColumns(tempData)
            if(diagnostics.logStages) console.timeEnd("Array of obj - calculating added columns")
        }

        //Search data
        if(searchValue) {
            if(diagnostics.logStages) console.time("Search")

            //Set up fuse.js fuzzy search
            let fuse
            let keys 
            if(mode == "arrObjs") keys = searchFields.length > 0 ? searchFields : keyStructure
            else if(mode == "arr") keys = ["value"]
            else if(mode == "obj") keys = ["value", "key"]

            //Account for select, which has different shown value
            let searchData = tempData.map(row=> {
                let newRow = {}

                for(let key of keys) {
                    //Filter out objects and arrays
                    if(row[key] && typeof row[key] != "string" && Array.isArray(row[key])) {
                        newRow[key] = "Array (" + row[key].length + " values)"
                    }                    
                    else if(row[key] && typeof row[key] != "string" && Object.keys(row[key]).length > 0) {
                        newRow[key] = "Object (" + Object.keys(row[key]).length + " properties)"
                    }

                    //Change values of selects with aliases
                    else if(config[key] && config[key].editable && config[key].editable.type == "select" && config[key].editable.options) {
                        let replacement = config[key].editable.options.find(o=> {
                            if(o.value == row[key]) {
                                return true
                            }
                        }).show

                        newRow[key] = replacement
                    }
                    else {
                        //Handle HTML
                        let val = row[key]
                        if(config[key].html) {
                            //Create element to get innerText
                            let div = document.createElement("div")
                            div.innerHTML = row[key]
                            val = div.innerText
                        }

                        newRow[key] = val
                    }
                }

                return newRow
            })

            fuse = new Fuse(searchData, { keys, threshold: 0.6 })
            let results = fuse.search(searchValue)

            searchData = null
            
            let searchResults = []
            for(let result of results) {
                searchResults.push(tempData[result.refIndex])
            }

            tempData = searchResults
            if(diagnostics.logStages) console.timeEnd("Search")
        }

        if(mode == "arrObjs") {
            if(diagnostics.logStages) console.time("Array of obj - filters")

            //Run tests for each filter
            filters.forEach(filter => {
                //Set filter type
                let filterData
                let type = "string"

                //If filter.key exists and a type is set on root or editable
                if(config[filter.key] && config[filter.key].type) {
                    if(config[filter.key].type == "date") {
                        type = "date"
                        filterData = new Date(filter.value)
                        filterData.setMinutes(filterData.getMinutes() + filterData.getTimezoneOffset())
                    }
                    else if(config[filter.key].type == "datetime") {
                        type = "datetime"
                        filterData = new Date(filter.value)
                        filterData.setMinutes(filterData.getMinutes() + filterData.getTimezoneOffset())
                    }
                    else if(config[filter.key].type == "number" || config[filter.key].type == "float") {
                        type = "number"
                        filterData = parseFloat(filter.value)
                    }
                    else {
                        filterData = filter.value
                    }
                }
                else {
                    filterData = filter.value
                }

                tempData = tempData.filter(row => {
                    let test = true
                    let rowData

                    //Account for HTML formatting
                    let rowFilterKey = row[filter.key]
                    if(config[filter.key].html) {
                        //Create element to get innerText
                        let div = document.createElement("div")
                        div.innerHTML = row[filter.key].trim()
                        rowFilterKey = div.innerText
                    }

                    //Account for datatypes
                    if(type == "date") rowData = new Date(rowFilterKey)
                    else if(type == "datetime") rowData = new Date(rowFilterKey)
                    else if(type == "number") rowData = parseFloat(rowFilterKey)
                    else rowData = rowFilterKey

                    //Filters
                    if(filter.comparison == "=") {
                        if(type == "date") {
                            let rowNoTime = new Date(rowData.getFullYear(), rowData.getMonth(), rowData.getDate())
                            let filterNoTime = new Date(filterData.getFullYear(), filterData.getMonth(), filterData.getDate())
                            test = rowNoTime.getTime() == filterNoTime.getTime()
                        }
                        else if(type == "datetime")
                            test = rowData.getTime() == filterData.getTime()
                        else if(type == "number")
                            test = parseFloat(rowData) == parseFloat(filterData)
                        else {
                            test = rowData == filterData
                        }
                    } 
                    if(filter.comparison == "<>") {
                        if(type == "date") {
                            let rowNoTime = new Date(rowData.getFullYear(), rowData.getMonth(), rowData.getDate())
                            let filterNoTime = new Date(filterData.getFullYear(), filterData.getMonth(), filterData.getDate())
                            test = rowNoTime.getTime() != filterNoTime.getTime()
                            console.log(`row: ${rowNoTime.getTime()} =? filter: ${filterNoTime.getTime()} --> ${test}`)
                        }
                        else if(type == "datetime")
                            test = rowData.getTime() != filterData.getTime()
                        else if(type == "number")
                            test = parseFloat(rowData) != parseFloat(filterData)
                        else
                            test = rowData != filterData
                    }
                    if(filter.comparison == ">") {
                        if(type == "date") {
                            let endOfDay = new Date(filterData.getTime() + ((1000 * 60 * 60 * 24) - 1))
                            test = rowData.getTime() > endOfDay.getTime()
                        }
                        else if(type == "datetime")
                            test = rowData.getTime() > filterData.getTime()
                        else if(type == "number") {
                            test = parseFloat(rowData) > parseFloat(filterData)
                        }
                        else
                            test = rowData > filterData
                    }
                    if(filter.comparison == "<") {
                        if(type == "date" || type == "datetime")
                            test = rowData.getTime() < filterData.getTime()
                        else if(type == "number")
                            test = parseFloat(rowData) < parseFloat(filterData)
                        else
                            test = rowData < filterData
                    }
                        
                    return test
                })
            })

            if(diagnostics.logStages) console.timeEnd("Array of obj - filters")
        }

        //Sort data
        if(sortBy != "none") {
            if(diagnostics.logStages) console.time("Sort data")
            tempData = tempData.sort(compareKeys(sortBy, sortOrder))
            if(diagnostics.logStages) console.timeEnd("Sort data")
        }

        //Paginate
        if(meta.maxResultsPerPage > 0) {
            if(diagnostics.logStages) console.time("Paginate")
            filteredMaxResults = tempData.length
            tempData = tempData.slice(currentRecordOffset, currentRecordOffset + meta.maxResultsPerPage)
            if(diagnostics.logStages) console.timeEnd("Paginate")
        }

        //Return sorted data
        sortedData = tempData

        //Go back a page if necessary
        if(currentRecordOffset > 0 && sortedData.length == 0)
            backOnePage()
        
        //Dispatch end of sort
        dispatch("endsort", {sortedData})

        if(diagnostics.logStages) {
            console.log("%cEnded - " + Date.now(), "color: lightblue; font-weight: bold; background: blue;")
            console.timeEnd("Sort duration")
            console.groupEnd("Sort")
        }

        exports.strResults = sortedData.length + " results"
    }

    function resizeTable() {
        //Check if we need to enter stacked or scrolled mode
        if(datatable) {
            if(!tableTooBig) {
                let rightPos = datatable.getBoundingClientRect().right
                //Set a new min breakpoint for the table (the smallest the table can be before it transitions to responsive display mode)
                //So: shrink the breakpoint if it is bigger than a smaller valid breakpoint
                if(breakpoint > rightPos || breakpoint == 0) {
                    if(window.innerWidth < rightPos ) {
                        breakpoint = rightPos
                    }
                    else {
                        breakpoint = rightPos //Guestimate a breakpoint
                    }
                    /*
                        The point of the if/else here is that the table could potentially get wider,
                        but is unlikely to get smaller if the window width is already smaller
                    */
                }
                
                if(window.innerWidth < breakpoint) {
                    tableTooBig = true
                }
            }
            else if(window.innerWidth > breakpoint) {
                tableTooBig = false
                setTimeout(resizeTable, 200)
            }
        }
    }

    function resetComponent() {
        breakpoint = 0 //Reset the breakpoint for new data
        setTimeout(resizeTable, 50) //Initial sizing; timeout is rather hacky, but allows Vue to rerender for accurate sizing
    }

    function selectAllRows() {
        if(!sortedData) return

        if(selectedRows.length > 0) {
            selectedRows = []
        }

        for(let i=0; i < sortedData.length; i++) {
            selectedRows[i] = topcheckboxChecked
        }
    }

    function addElement() {
        if(!controls.overrideAddModal) {
            let newElement
            if(mode == "arrObjs") newElement = {}
            else if(mode == "arr") newElement = ""
            else if(mode == "obj") {
                newPropVal = ""
                propAddModalOpen = true
                return
            }

            for(let i=0; i<keyStructure.length; i++) {
                //Omit explicitly ommitted columns and hmkIndex
                if(keyStructure[i] != "hmkIndex" && !config[keyStructure[i]].omit) {
                    let defaultValue = config[keyStructure[i]]
                        && config[keyStructure[i]].editable 
                        && config[keyStructure[i]].editable.defaultValue
                        ? config[keyStructure[i]].editable.defaultValue 
                        : ""

                    if(mode == "arrObjs") {
                        newElement[keyStructure[i]] = defaultValue
                    }
                    else if(mode == "arr") {
                        newElement = defaultValue
                    }
                }
            }

            tableData.push(newElement)
            tableData = tableData
        }

        dispatch("addedItem", { row: tableData[tableData.length - 1], index: tableData.length - 1 })
        dispatch("changed", tableData)
    }

    function addProperty() {
        propAddModalOpen = false
        tableData[newPropVal] = ""
        tableData = tableData
        dispatch("addedItem", { row: tableData[newPropVal], property: newPropVal })
        dispatch("changed", tableData)
    }

    function deleteElements() {
        //Handle object property deletion
        if(mode == "obj") {
            let propertiesToRemove = []
            sortedData.forEach((row, index)=> {
                if(selectedRows[index]) {
                    propertiesToRemove.push(row.key)
                    delete tableData[row.key]
                }
            })

            if(!controls.overrideDeleteModal) {
                tableData = tableData

                deleteModalOpen = false
                topcheckboxChecked = false
                selectedRows = []
            }

            dispatch("deleted", {property: propertiesToRemove})
            dispatch("changed", tableData)
            return
        }

        //Find where in the tableData array this is
        let indicesToRemove = []
        sortedData.forEach((row, index)=> {
            if(selectedRows[index])
                indicesToRemove.push(row.hmkIndex)
        })

        if(!controls.overrideDeleteModal) {
            //Filter indices out of tableData
            let filteredData = tableData.filter((row, index)=> {
                if(!indicesToRemove.includes(index)) return true
            })
            tableData = filteredData
            deleteModalOpen = false
            topcheckboxChecked = false
            selectedRows = []
        }

        dispatch("deleted", {indices: indicesToRemove})
        dispatch("changed", tableData)
    }

    function returnSelected() {
        //Find where in the tableData array this is
        let indices = []
        sortedData.forEach((row, index)=> {
            if(selectedRows[index])
                indices.push(row.hmkIndex)
        })

        dispatch("checked", {indices})
    }

    function updateSource(row) {
        if(mode == "obj") {
            tableData[row.key] = row.value
            dispatch("updated", {value: tableData[row.key], property: row.key})
            dispatch("changed", tableData)
            return
        }

        let prunedRow

        if(mode == "arrObjs") {
            prunedRow = {}
            for(let key of Object.keys(row)) {
                if((!config[key] || !config[key].omit) && key != "hmkIndex")
                    prunedRow[key] = row[key]
            }
        }

        else if(mode == "arr") {
            prunedRow = ""
            for(let key of Object.keys(row)) {
                if((!config[key] || !config[key].omit) && key != "hmkIndex")
                    prunedRow = row[key]
            }
        }

        tableData[row.hmkIndex] = prunedRow
        dispatch("updated", {row: tableData[row.hmkIndex], index: row.hmkIndex})
        dispatch("changed", tableData)
    }

    function openDeleteModal() {
        if(!selectedRows.includes(true)) return 

        if(controls.overrideDeleteModal) {
            deleteElements()
            return
        }
        if(selectedRows.includes(true))
            deleteModalOpen = true
    }

    function closeFilters() {
        filterModalOpen = false
        currentRecordOffset = 0
        reSort("filter update")
    }

    function changeSortBy(keyname, disable = true) {
        currentRecordOffset = 0
        if(sortBy == keyname) {
            if(sortOrder == 'asc') sortOrder = 'desc'
            else if(sortOrder == 'desc') {
                //Only clear the sortBy value if the button is allowed to disable sort
                if(disable)
                    sortBy = 'none'
                sortOrder = 'asc'
            }
        }
        else {
            sortBy = keyname
            sortOrder = 'asc'
        }
        
        reSort("sort order change")
    }

    function compareKeys(key, order = 'asc') {
        if(mode == "arr") {
            key = "value"
        }
        else if(mode == "obj") {
            key = "key"
        }

        return function(a, b) {
            let aKey = a[key]
            let bKey = b[key]

            //Filter out objects and arrays
            if(aKey && typeof aKey != "string" && Array.isArray(aKey)) {
                aKey = "Array (" + aKey.length + " values)"
            }                    
            else if(aKey && typeof aKey != "string" && Object.keys(aKey).length > 0) {
                aKey = "Object (" + Object.keys(aKey).length + " properties)"
            }
            else if(!aKey)
                aKey = ""

            if(bKey && typeof bKey != "string" && Array.isArray(bKey)) {
                bKey = "Array (" + bKey.length + " values)"
            }                    
            else if(bKey && typeof bKey != "string" && Object.keys(bKey).length > 0) {
                bKey = "Object (" + Object.keys(bKey).length + " properties)"
            }
            else if(!bKey)
                bKey = ""

            //Check types
            if(config[key].type) {
                if(config[key].type == "date" || config[key].type == "datetime") {
                    aKey = new Date(aKey)
                    bKey = new Date(bKey)
                }
            }
            // if(typeof aKey !== typeof bKey)
            //     return 0
            // else if(!isNaN(aKey)) {
            //     aKey = parseFloat(aKey)
            //     bKey = parseFloat(bKey)
            // }
            // else if(typeof aKey === 'string') {
            //     aKey = aKey.toLowerCase()
            //     bKey = bKey.toLowerCase()
            // }

            //Sort
            let sortOrder = 1
            if(order == 'desc') sortOrder = -1
            if(aKey > bKey) return 1 * sortOrder
            else if(aKey < bKey) return -1 * sortOrder
        }
    }

    //React to search change
    function searchChange(){
        if(!(searchFields && Array.isArray(searchFields) && searchFields.length)) return
        if(!initialSearch) {
            initialSearch = true
            if(!searchValue) return
        }

        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(()=> {
            sortBy = 'none'
            sortOrder = 'asc'
            currentRecordOffset = 0
            reSort("search query change")
        }, 200)
    }

    //Page nav
    function backOnePage() {
        if(currentRecordOffset > 0) {
            currentRecordOffset -= meta.maxResultsPerPage
            reSort("page change (back)")
        }
    }
    function forwardOnePage() {
        if(currentRecordOffset + meta.maxResultsPerPage < filteredMaxResults) {
            currentRecordOffset += meta.maxResultsPerPage
            reSort("page change (forward)")
        }
    }

    function handleCustomMenuClick(e) {
        if(e.target.dataset.preventdefault) e.preventDefault()
        customMenuOpen = false

        //Return indices
        let indices = []
        sortedData.forEach((row, index)=> {
            if(selectedRows[index])
                indices.push(row.hmkIndex)
        })

        dispatch("customMenuClick", {indices, menuoption: e.target.dataset.menuoption, tableData, sortedData})
    }

    function reInitializeTable() {
        //Set up data (overwrite with user preferences)
        meta = {...meta, ...metadata}
        dataInterface = {...dataInterface, ...processing}
        controls = {...controls, ...interactivity}

        //Initial settings
        if(sourceData)
            tableData = JSON.parse(JSON.stringify(sourceData))
        else if(!tableData) tableData = []

        initialLoad = true
        reSetupConfig()
        reSort("table data change")
        resetComponent()

        dispatch("initialized", {tableData})
    }

    onMount(()=> {
        reInitializeTable()
    })
</script>

<!-- Control row -->
<div class='controlrow'>
    {#if meta.tableHeadHtml}
        {@html meta.tableHeadHtml}
    {/if}
    {#if meta.maxResultsPerPage != 0 && meta.maxResultsPerPage < (mode == "obj" ? Object.keys(tableData).length : tableData.length)}
        <img class='page-arrow' class:disabled={searchValue != ""} alt='back one page' on:click={backOnePage} src='/icons/datatable/left-arrow.svg'>
    {/if}
    {#if !meta.displayOnly && !controls.hideAll && searchFields && Array.isArray(searchFields) && searchFields.length}
        <input type="text" placeholder="Search" bind:value={searchValue}>
    {:else}
        <div></div>
    {/if}
    {#if meta.maxResultsPerPage != 0 && meta.maxResultsPerPage < (mode == "obj" ? Object.keys(tableData).length : tableData.length)}
        <div class="px-1">
            {#if !searchValue}
                Page { Math.ceil(currentRecordOffset / meta.maxResultsPerPage) + 1 }/{ Math.ceil((mode == "obj" ? Object.keys(tableData).length : tableData.length)/meta.maxResultsPerPage) }
            {:else}
                Results
            {/if}
        </div>
    {/if}
    <div class='sortby-dropdown' class:shown={tableTooBig && meta.responsiveType == "stack"}>
        <select id='sortBy' bind:value={sortBy}>
            <option value="" selected='selected'>None</option>
            {#each keyStructure.filter(key => config[key].enabled !== false) as keyName}
                <option value="{keyName}">{keyName}</option>
            {/each}
        </select>
        <img alt="" class='icon-withbg' src={ sortOrder == "asc" ? "/icons/datatable/sort-asc.svg" : "/icons/datatable/sort-desc.svg" }>
    </div>
    {#if !controls.hideAll}
        <div class='tableActions'>
            {#each customButtons as btn}
                <img class="table_button hoverButton {btn.class}" alt={btn.alt} on:click={dispatch(btn.event)} src={btn.src}>
            {/each}
            {#if !controls.hideAddButton}
                <img class='table_button hoverButton' alt='add row' on:click={addElement} src='/icons/datatable/add.svg'>
            {/if}
            {#if !controls.hideDeleteButton}
                <img class='table_button deleter hoverButton' class:hoverButton={ selectedRows.includes(true) } alt='delete rows' on:click={openDeleteModal} src='/icons/datatable/delete.svg'>
            {/if}
            {#if mode == "arrObjs" && !controls.hideFilterButton}
                <span class='filterspan' on:click={ ()=> { if(!controls.overrideFilterModal) filterModalOpen = true; dispatch("filter") }}>
                    <img class='table_button hoverButton' alt='filter' src='/icons/datatable/filter.svg'>
                    {#if filters.length > 0} <span class='filterlength'>{ filters.length }</span> {/if}
                </span>
            {/if}
            {#if controls.customMenu}
                <span class="position-relative">
                    <img src="/icons/datatable/vertical-menu-dots.svg" alt="table menu" class="table_button customMenu hoverButton" on:click={()=> { customMenuOpen = true }}>
                    {#if customMenuOpen}
                        <div class="customMenuBackground" transition:fade={{ duration: 200 }} on:click={()=> { customMenuOpen = false }}></div>
                        <div transition:slide={{duration: 200}} class="customMenuBar" on:click|preventDefault|stopPropagation class:highZ={customMenuOpen}>
                            {#each controls.customMenu as opt}
                                <a href={opt.href || opt.display} class:disabled={opt.disabled} on:click={handleCustomMenuClick} data-menuoption={opt.display} data-preventdefault={opt.preventDefault || false}>{opt.display}</a>
                            {/each}
                        </div>
                    {/if}
                </span>
            {/if}
        </div>
    {/if}
    {#if meta.maxResultsPerPage != 0 && meta.maxResultsPerPage < (mode == "obj" ? Object.keys(tableData).length : tableData.length)}
        <img class='page-arrow' class:disabled={searchValue != ""} alt='forward one page' on:click={forwardOnePage} src='/icons/datatable/right-arrow.svg'>    
    {/if}
    <div class="full-length">
        <slot name="under_controls"></slot>
    </div>
</div>

<!-- Table-constraining div and table -->
<div class='constrain-table' class:limitHeight={meta.limitHeight} style="max-height: {meta.maxHeight}" class:scroll={ meta.responsiveType == 'scroll' }>
    <table this={datatable} class:stack={meta.responsiveType == 'stack'} class:tooBig={ tableTooBig } style="width: {meta.tableWidth}; min-width: {meta.tableMinWidth}; max-width: {meta.tableMaxWidth};">
        <thead>
            <tr>
                {#if !controls.hideCheckboxes}
                    {#if sortedData && sortedData.length > 0}
                        <th class="hover-event checkbox-td" on:click={()=>{ topcheckboxChecked = !topcheckboxChecked }}><input type='checkbox' bind:checked={topcheckboxChecked}></th>
                    {:else}
                        <th class="checkbox-td"></th>
                    {/if}
                {/if}
                {#each keyStructure.filter(key => config[key].enabled !== false) as keyName, i}
                    <th style="width: {config[keyName].width ? config[keyName].width : ""};" class:hover-event={dataInterface.sortable} class="left-pad" on:click={()=> { if(!dataInterface.sortable) return; changeSortBy(keyName)}}>
                        <span class="left-pad">{config[keyName] && config[keyName].alias ? config[keyName].alias : keyName}</span>
                        {#if sortBy == keyName}
                            <img class='inline-icon' alt="" src={ sortOrder == "asc" ? "/icons/datatable/sort-asc.svg" : "/icons/datatable/sort-desc.svg" }>
                        {/if}
                    </th>
                {/each}
            </tr>
        </thead>

        <!-- DATA BODY -->
        <tbody>
            {#if sortedData}
            {#if sortedData.length > 0}
                {#each sortedData as row, index}
                    <tr class:selected={ selectedRows[index] == true } class="{row_class && row_class.map(classes=> classes.index).includes(index) ? row_class.map(classes=> classes.classNames).join(" ") : ""}">
                        {#if !controls.hideCheckboxes}
                            <td class="hover-event checkbox-td" on:click={()=> { selectedRows[index] = !selectedRows[index] }}>
                                <input bind:checked={selectedRows[index]} type='checkbox'>
                            </td>
                        {/if}
                        {#if mode == "arrObjs"}
                            {#each keyStructure.filter(key => config[key].enabled !== false) as keyName}
                                <DataTableValue width={config[keyName].width} config={config[keyName]} bind:value={row[keyName]} {row} {keyName} on:updated={()=>{ updateSource(row) }} on:fieldClick={dispatch("fieldClick", {field: keyName, row, index: row.hmkIndex})}/>
                            {/each}
                        {:else if mode == "arr"}
                            <DataTableValue config={config[keyStructure[0]]} bind:value={row.value} on:updated={()=>{ updateSource(row) }} on:fieldClick={dispatch("fieldClick", {row: row.value, index: row.hmkIndex})}/>
                        {:else if mode == "obj"}
                            <DataTableValue config={config[keyStructure[0]]} bind:objKey={row.key} bind:value={row.value} on:updated={()=>{ updateSource(row) }} on:fieldClick={dispatch("fieldClick", {field: row.key, row: row.value})}/>
                        {/if}
                    </tr>
                {/each}
            {:else}
                <tr>
                    {#if !controls.hideDeleteButton && !controls.hideCheckboxes}
                        <td></td>
                    {/if}
                    <td colspan={keyStructure.length} class='padLeft'>{dataInterface.noDataNote}</td>
                </tr>
            {/if}
            {/if}
        </tbody>
    </table>
</div>

<!-- Modal (for deletes) -->
{#if deleteModalOpen}
    <Modal heading="Delete { numSelectedRows } row{numSelectedRows > 1 ? "s" : ""}?" on:close={()=> { deleteModalOpen = false }}>
        <p>Are you sure you want to delete this data?</p>
        <div class='buttonrow'>
            <button on:click={deleteElements}>OK</button> <button on:click={()=> { deleteModalOpen = false }} class='cancel'>Cancel</button>
        </div>
    </Modal>
{/if}

<!-- Modal (for messages) -->
{#if messageModal.open}
    <Modal heading="{ messageModal.header }" on:close={()=> { messageModal.open = false }}>
        <p>{ messageModal.message }</p>
        <div class='buttonrow'>
            <button on:click={()=> { messageModal.open = false }}>OK</button>
        </div>
    </Modal>
{/if}

<!-- Modal (for adding property) -->
{#if propAddModalOpen}
    <Modal heading="Name your property" on:close={()=> { propAddModalOpen = false }}>
        <p>What is the name of your new property?</p>
        <input type="text" bind:value={newPropVal} placeholder="propertyName">
        <div class='buttonrow'>
            <button on:click={ addProperty }>OK</button>
        </div>
    </Modal>
{/if}

<!-- Modal (for filter) -->
{#if filterModalOpen}
    <Modal heading="Edit filters" closable={false}>
        <form class="filter-modal" on:submit|preventDefault={()=> {closeFilters() }}>
            {#each filters as filter, index}
                <div class='filter'>
                    <select bind:value={filter.key}>
                        {#each keyStructure.filter(key => config[key].enabled !== false) as keyOption, index}
                            {#if !noFilterFields.includes(keyOption)}
                                <option value="{keyOption}">{config[keyOption].alias ? config[keyOption].alias : keyOption} {#if config[keyOption] && config[keyOption].type}({config[keyOption].type}){:else}(string){/if}</option>
                            {/if}
                        {/each}
                    </select>
                    <select bind:value={filter.comparison}>
                        <option selected='selected'>&#61;</option>
                        <option>&lt;&gt;</option>
                        <option>&gt;</option>
                        <option>&lt;</option>
                    </select>
                    <!-- Filter inputs by type -->
                    {#if config[filter.key] && config[filter.key].type}
                        {#if config[filter.key].type == "date"}
                            <input bind:value={filter.value} type="date">
                        {:else if  config[filter.key].type == "datetime"}
                            <input bind:value={filter.value} type="datetime">
                        {:else if  config[filter.key].type == "number"}
                            <input bind:value={filter.value} type="number">
                        {:else if  config[filter.key].type == "float"}
                            <input bind:value={filter.value} type="number" step=".00001">
                        {:else}
                            <input bind:value={filter.value}>
                        {/if}
                    {:else}
                        <input bind:value={filter.value}>
                    {/if}
                    <img alt='remove filter' class='deleteButton' src='/icons/datatable/delete.svg' on:click={()=> { filters.splice(index,1); filters = filters; }}>
                </div>
            {/each}
            <div class='margintop' on:click={()=> { filters.push({comparison: '='}); filters = filters; currentRecordOffset = 0 }}>
                <img alt='add filter' class='hoverButton' src='/icons/datatable/add.svg'> Add a filter
            </div>
            <div class='buttonrow'>
                <button type="submit">OK</button>
            </div>
        </form>
    </Modal>
{/if}

{#if columnsModalOpen}
    <Modal fullwidth={true} heading="Select Columns" closable={false}>
        <p>Select which columns appear on this table.</p>
        
        <div class="column-sections">
            {#each column_categories as category}
                <div class="column-subsection">
                    <h3>
                        <input id={category} type="checkbox" disabled={category == "Required"} checked={(()=> {
                                if(category == "Required") return true
                                let keys = Object.keys(config).filter(x=> config[x].category == category)
                                let checked = 0
                                for(let i=0; i < keys.length; i++) if(config[keys[i]].enabled !== false) checked += 1
                                if(checked == keys.length) return true
                                return false
                            })()}
                            on:change={()=> {
                                let keys = Object.keys(config).filter(x=> config[x].category == category)
                                let checked = 0
                                for(let i=0; i < keys.length; i++) if(config[keys[i]].enabled !== false) checked += 1
                                if(checked == keys.length)
                                    for(let i=0; i < keys.length; i++) config[keys[i]].enabled = false
                                else
                                    for(let i=0; i < keys.length; i++) config[keys[i]].enabled = true
                            }}
                        >
                        <label for={category}>{category}</label>
                    </h3>
                    <div class="column-picker-section">
                        {#each Object.keys(config).filter(x=> config[x].category == category) as key}
                            <div>
                                <input id={"check-"+category+"-"+key} type="checkbox" disabled={config[key].category == "Required"} bind:checked={config[key].enabled}>
                                <label class:disabled={config[key].category == "Required"} for={"check-"+category+"-"+key}>{config[key].Alias ? config[key].Alias : key}</label>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>

        <div class="centered mt-2"><button on:click={()=>{ columnsModalOpen = false; dispatch("changedColumns"); reSort() }}>OK</button></div>
    </Modal>
{/if}