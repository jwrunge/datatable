<script>
    import {onMount, createEventDispatcher, tick} from "svelte"
    import Fuse from "fuse.js"
    import Modal from "./Modal.svelte"
    import DataTableValue from "./DataTableValue.svelte"
    import {DataInterface} from "./datatableFuncs.js"

    const dispatch = createEventDispatcher()

    export let sourceData
    let tableData
    export let responsiveType = "stack"
    export let limitHeight = false
    
    export let maxResultsPerPage = 0
    export let displayOnly = false
    export let tableWidth = "100%"
    export let tableMinWidth = "none"
    export let tableMaxWidth = "none"
    export let addedColumns = null
    export let hideControls = false
    export let hideAddButton = false
    export let hideDeleteButton = false
    export let hideFilterButton = false
    export let autoEditable = false
    export let autoClickable = false
    export let autoSearchable = false
    export let noDataNote = "No data present"
    export let sortable = true
    export let hideCheckboxes = false

    let keyStructure = []
    let searchFields = []
    let noFilterFields = []
    export let configuration = null
    let config = {}

    //Refs
    let datatable
    let topcheckboxChecked = false
    let skipReSort = false
    
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

    //Watch
    $: sourceData, handleTableDataChange()
    $: tableData, getSortedData()
    $: configuration, setupConfig()
    $: responsiveType, resetComponent()
    $: searchValue, searchChange()
    $: topcheckboxChecked, selectAllRows()
    $: selectedRows, calcSelectedRows()
    $: maxResultsPerPage, (()=> {
        currentRecordOffset = 0
        getSortedData()
    })()

    //Functions
    function handleTableDataChange() {
        if(sourceData)
            tableData = JSON.parse(JSON.stringify(sourceData))
        else if(!tableData) tableData = []

        setupConfig()

        getSortedData()
        resetComponent()
    }

    function setupConfig() {
        //Set search fields and no filter fields
        searchFields = []
        noFilterFields = []
        keyStructure = []

        //Set mode
        mode = DataInterface.determineMode(tableData)
        
        //Set variables based on config value
        if(!configuration) {
            config = {}
            let initValue = {}

            if(!autoEditable, !autoSearchable, !autoClickable)
                initValue = true
            else {
                if(autoEditable) initValue.editable = { type: "text" }
                if(autoSearchable) initValue.searchable = true
                if(autoClickable) initValue.clickable = autoClickable
            }

            if(mode == 'arrObjs') {
                for(let key in tableData[0]) {
                    keyStructure.push(key)
                    config[key] = initValue
                    if(autoSearchable) searchFields.push(key)
                }
            }
            else if(mode == 'arr') {
                keyStructure.push("Values")
                config["Values"] = initValue
                if(autoSearchable) searchFields.push("Values")
            }
            else if(mode == 'obj') {
                keyStructure.push("Values")
                config["Values"] = initValue
                if(autoSearchable) searchFields.push("Values")
            }
        } else { //If the configuration data was set
            config = configuration
            for(let i=0; i<Object.keys(config).length; i++) {
                let key = Object.keys(config)[i]
                let val = config[key]

                if(val.searchable) searchFields.push(key)
                if(val.filter === false) noFilterFields.push(key)
                keyStructure.push(key)

                // if(mode != "arrObjs") break
            }
        }

        if(keyStructure.length > 1) mode = "arrObjs"
    }

    function calcSelectedRows() {
        let accum = 0
        for(let i=0; i<selectedRows.length; i++) { 
            if(selectedRows[i]==true) 
                accum++ 
        }
        numSelectedRows = accum
    }

    function calcAddedColumns(row, index, column) {
        //Row and index are used in eval
        if(column.value) return column.value
        else if(column.eval) {
            return Function(`'use strict'; let row = ${JSON.stringify(row)}; let index = ${index}; return (${column.eval})`)()
            //return eval(column.eval)
        }
        else return ""
    }

    function getSortedData() {
        if(skipReSort) {
            skipReSort = false
            return
        }

        if(!tableData || tableData.length == 0) {
            sortedData = []
            return
        }

        selectedRows = []
        
        //Avoid mutating the array by copying it (if it's an array!)
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

        //Handle array
        if(mode == "arr") {
            //Assign indices to correspond with tableData
            tempData = tempData.map((row, index)=> {
                return {value: row, hmkIndex: index}
            })
        }

        //Handle array of objects
        if(mode == "arrObjs") {
            //Assign indices to correspond with tableData
            tempData = tempData.map((row, index)=> {
                return {...row, hmkIndex: index}
            })

            //If we are adding columns, do it now
            if(addedColumns) {
                for(let column of addedColumns) {
                    for(let i=0; i < tempData.length; i++) {
                        tempData[i][column.colName] = calcAddedColumns(tempData[i], tempData[i].hmkIndex, column)
                    }
                }
            }
        }

        //Search data
        if(searchValue) {
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
                    else newRow[key] = row[key]
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
        }

        if(mode == "arrObjs") {
            //Run tests for each filter
            filters.forEach(filter => {
                tempData = tempData.filter(row => {
                    let test = true
                    let rowData, filterData

                    //Account for data type
                    if(config[filter.key] && config[filter.key].editable && config[filter.key].editable.type == 'date') {
                        rowData = new Date(row[filter.key])
                        filterData = new Date(filter.value)
                    }
                    else {
                        rowData = row[filter.key]
                        filterData = filter.value
                    }

                    if(filter.comparison == "=") {
                        if(rowData instanceof Date)
                            test = rowData.getTime() == filterData.getTime()
                        else
                            test = rowData == filterData
                    } 
                    if(filter.comparison == "<>") {
                        if(rowData instanceof Date)
                            test = rowData.getTime() != filterData.getTime()
                        else
                            test = rowData != filterData
                    }
                    if(filter.comparison == ">")
                        test = rowData > filterData
                    if(filter.comparison == "<")
                        test = rowData < filterData
                        
                    return test
                })
            })
        }

        //Sort data
        if(sortBy != "none")
            tempData = tempData.sort(compareKeys(sortBy, sortOrder))

        //Paginate
        if(maxResultsPerPage > 0) {
            filteredMaxResults = tempData.length
            tempData = tempData.slice(currentRecordOffset, currentRecordOffset + maxResultsPerPage)
        }

        //Return sorted data
        sortedData = tempData

        //Go back a page if necessary
        if(currentRecordOffset > 0 && sortedData.length == 0)
            backOnePage()
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
        if(selectedRows.length > 0) {
            selectedRows = []
        }

        for(let i=0; i < sortedData.length; i++) {
            selectedRows[i] = topcheckboxChecked
        }
    }

    function addElement() {
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
            tableData = tableData

            deleteModalOpen = false
            topcheckboxChecked = false
            selectedRows = []

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

        //Filter indices out of tableData
        let filteredData = tableData.filter((row, index)=> {
            if(!indicesToRemove.includes(index)) return true
        })
        tableData = filteredData
        deleteModalOpen = false
        topcheckboxChecked = false
        selectedRows = []

        dispatch("deleted", {indices: indicesToRemove})
        dispatch("changed", tableData)
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
        if(selectedRows.includes(true))
            deleteModalOpen = true
    }

    function closeFilters() {
        filterModalOpen = false
        currentRecordOffset = 0
        getSortedData()
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
        
        getSortedData()
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
        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(()=> {
            sortBy = 'none'
            sortOrder = 'asc'
            currentRecordOffset = 0
            getSortedData()
        }, 200)
    }

    //Page nav
    function backOnePage() {
        if(currentRecordOffset > 0) {
            currentRecordOffset -= maxResultsPerPage
            getSortedData()
        }
    }
    function forwardOnePage() {
        if(currentRecordOffset + maxResultsPerPage < filteredMaxResults) {
            currentRecordOffset += maxResultsPerPage
            getSortedData()
        }
    }

    onMount(()=> {
        if(!tableData) tableData = []
        resetComponent()
    })
</script>

<svelte:options tag="data-table"/>

<!-- Table-constraining div and table -->
<div class='constrain-table' class:limitHeight={limitHeight} class:scroll={ responsiveType == 'scroll' }>
    <table this={datatable} class:stack={responsiveType == 'stack'} class:tooBig={ tableTooBig } style="width: {tableWidth}; min-width: {tableMinWidth}; max-width: {tableMaxWidth};">
        <thead>
            <tr>
                {#if !hideDeleteButton && !hideCheckboxes}
                    {#if sortedData.length > 0}
                        <th class="hover-event checkbox-td" on:click={()=>{ topcheckboxChecked = !topcheckboxChecked }}><input type='checkbox' bind:checked={topcheckboxChecked}></th>
                    {:else}
                        <th class="checkbox-td"></th>
                    {/if}
                {/if}
                {#each keyStructure as keyName, i}
                    <th class:hover-event={sortable} class="left-pad" on:click={()=> { if(!sortable) return; changeSortBy(keyName)}}>
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
            {#if sortedData.length > 0}
                {#each sortedData as row, index}
                    <tr class:selected={ selectedRows[index] == true }>
                        {#if !hideDeleteButton && !hideCheckboxes}
                            <td class="hover-event checkbox-td" on:click={()=> { selectedRows[index] = !selectedRows[index] }}>
                                <input bind:checked={selectedRows[index]} type='checkbox'>
                            </td>
                        {/if}
                        {#if mode == "arrObjs"}
                            {#each keyStructure as keyName}
                                <DataTableValue config={config[keyName]} bind:value={row[keyName]} {row} {keyName} on:updated={()=>{ updateSource(row) }} on:fieldClick={dispatch("fieldClick", {field: keyName, row, index: row.hmkIndex})}/>
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
                    {#if !hideDeleteButton && !hideCheckboxes}
                        <td></td>
                    {/if}
                    <td colspan={keyStructure.length} class='padLeft'>{noDataNote}</td>
                </tr>
            {/if}

            <!-- CONTROL ROW -->
            <tr class="controls">
                <td colspan={keyStructure.length + 1}>
                <div class='controlrow'>
                    {#if maxResultsPerPage != 0 && maxResultsPerPage < (mode == "obj" ? Object.keys(tableData).length : tableData.length)}
                        <img class='page-arrow' class:disabled={searchValue != ""} alt='back one page' on:click={backOnePage} src='/icons/datatable/left-arrow.svg'>
                    {/if}
                    {#if !displayOnly && !hideControls && searchFields && Array.isArray(searchFields) && searchFields.length}
                        <input type="text" placeholder="Search" bind:value={searchValue}>
                    {:else}
                        <div></div>
                    {/if}
                    {#if maxResultsPerPage != 0 && maxResultsPerPage < (mode == "obj" ? Object.keys(tableData).length : tableData.length)}
                        <div class="px-1">
                            {#if !searchValue}
                                Page { Math.ceil(currentRecordOffset / maxResultsPerPage) + 1 }/{ Math.ceil((mode == "obj" ? Object.keys(tableData).length : tableData.length)/maxResultsPerPage) }
                            {:else}
                                Results
                            {/if}
                        </div>
                    {/if}
                    <div class='sortby-dropdown' class:shown={tableTooBig && responsiveType == "stack"}>
                        <select id='sortBy' bind:value={sortBy}>
                            <option value="" selected='selected'>None</option>
                            {#each keyStructure as keyName}
                                <option value="{keyName}">{keyName}</option>
                            {/each}
                        </select>
                        <img alt="" class='icon-withbg' src={ sortOrder == "asc" ? "/icons/datatable/sort-asc.svg" : "/icons/datatable/sort-desc.svg" }>
                    </div>
                    {#if !hideControls}
                        <div class='tableActions'>
                            {#if !hideAddButton}
                                <img class='hoverButton' alt='add row' on:click={addElement} src='/icons/datatable/add.svg'>
                            {/if}
                            {#if !hideDeleteButton}
                                <img class='deleter' class:hoverButton={ selectedRows.includes(true) } alt='delete rows' on:click={openDeleteModal} src='/icons/datatable/delete.svg'>
                            {/if}
                            {#if mode == "arrObjs" && !hideFilterButton}
                                <span class='filterspan' on:click={ ()=> { filterModalOpen = true }}>
                                    <img class='hoverButton' alt='filter' src='/icons/datatable/filter.svg'>
                                    {#if filters.length > 0} <span class='filterlength'>{ filters.length }</span> {/if}
                                </span>
                            {/if}
                        </div>
                    {/if}
                    {#if maxResultsPerPage != 0 && maxResultsPerPage < (mode == "obj" ? Object.keys(tableData).length : tableData.length)}
                        <img class='page-arrow' class:disabled={searchValue != ""} alt='forward one page' on:click={forwardOnePage} src='/icons/datatable/right-arrow.svg'>    
                    {/if}
                </div>
                </td>
            </tr>
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
        <div class="filter-modal">
            {#each filters as filter, index}
                <div class='filter'>
                    <select bind:value={filter.key}>
                        {#each keyStructure as keyOption, index}
                            {#if !noFilterFields.includes(keyOption)}
                                <option value="{keyOption}">{config[keyOption].alias ? config[keyOption].alias : keyOption}</option>
                            {/if}
                        {/each}
                    </select>
                    <select bind:value={filter.comparison}>
                        <option selected='selected'>&#61;</option>
                        <option>&lt;&gt;</option>
                        <option>&gt;</option>
                        <option>&lt;</option>
                    </select>
                    <input bind:value={filter.value}>
                    <img alt='remove filter' class='deleteButton' src='/icons/datatable/delete.svg' on:click={()=> { filters.splice(index,1); filters = filters; }}>
                </div>
            {/each}
            <div class='margintop' on:click={()=> { filters.push({comparison: '='}); filters = filters; currentRecordOffset = 0 }}>
                <img alt='add filter' class='hoverButton' src='/icons/datatable/add.svg'> Add a filter
            </div>
            <div class='buttonrow'>
                <button on:click={()=> {closeFilters() }}>OK</button>
            </div>
        </div>
    </Modal>
{/if}