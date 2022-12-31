<script lang="ts">
    import { tick } from "svelte"
    import type { Config, Filter } from "./config"
    import { loadData, setupSearch, search, sortBy, filter, paginate, SortOrder } from "./processing"
    import { onMount, onDestroy } from "svelte"
    import PaginationUi from "./PaginationUI.svelte"

    //State data
    let initialLoad = false
    let sortedTrigger = false
    let mouse: {
        row: number | undefined
        col: number | undefined
    } = {
        row: undefined,
        col: undefined
    }

    //Images
    export let backIcon: string | undefined = undefined, forwardIcon: string | undefined = undefined
    export let ascIcon = "▲"
    export let descIcon = "▼"

    let sortIcons = [
        " ",
        ascIcon,
        descIcon
    ]
    
    //Primary data
    export let sourceData: any[] = []
    export let config: Config = {
        paginate: false,
        columns: {},
        searchable: null,
        noDataNote: "No data available"
    }
    let tableData: any[] = []
    let columnOrder: (keyof Config["columns"])[] = []

    let tableEl
    let tableContainer
    let checkboxEl

    export let searchEntry: string = ""
    let fuseSearch: any
    let sortByKey: keyof Config["columns"] = ""
    let sortByOrder: SortOrder = SortOrder.DEFAULT

    //Pagination function (for fetching from the server)
    export let paginationFunc: Function = null
    export let paginationShow = "page"
    let unpaginatedResults = 0

    //UI settings
    export let showPaginationUI = false

    //Exported metadata
    export let tableClass: string = "datatable"
    export let page: number = 1
    export let totalPages: number = 1
    export let pageResults: number = 0
    export let totalResults: number = 0
    export let totalResultsOverride: number = 0
    export let filters: Filter[] = []

    //Dimensions
    export let minHeight: string = "auto"
    export let maxHeight: string = "98vh"
    export let height: string = "auto"

    //Search, filter, sort, paginate
    async function sfsp() {
        //Initial load set on first sfsp
        initialLoad = true

        //Search, filter, sort
        if(searchEntry)
            tableData = search(searchEntry, fuseSearch) ?? sourceData.slice(0)
        else
            tableData = sourceData.slice(0)
        if(filters && filters.length) tableData = filter(tableData, filters)
        if(sortByKey) tableData = sortBy(tableData, sortByKey, sortByOrder, config.columns)
        totalResults = tableData.length //Get the pre-paginated total results

        //Paginate
        unpaginatedResults = tableData.length
        let pagination = paginate(tableData, page, totalResultsOverride || totalResults, config)    //Allow total results override in case source has unloaded database information
        tableData = pagination.data
        totalPages = pagination.totalPages || 1
        pageResults = tableData.length

        sortedTrigger = !sortedTrigger

        //Resize
        windowResize()
    }

    //Handle source data change
    $: {
        sourceData = loadData(sourceData, config)

        //Set column order
        if(config.columnOrder) columnOrder = config.columnOrder
        else columnOrder = Object.keys(config.columns)

        tableData = JSON.parse(JSON.stringify(sourceData))

        fuseSearch = setupSearch(sourceData, config.searchable ?? columnOrder as string[], config)
    }

    //Handle search data change (only run search every keyTimeout ms)
    const KEY_TIMEOUT = 500
    let searchKeyTimer: NodeJS.Timeout
    function queueSearchChange(searchStr: string) {
        if(searchKeyTimer) clearTimeout(searchKeyTimer)
        if(searchStr || searchStr === "") {
            searchKeyTimer = setTimeout(()=> {
                page = 1
                sfsp()
            }, KEY_TIMEOUT)
        }
    }

    $: queueSearchChange(searchEntry)

    //Handle table fill screen
    let columnWidthOverride: string = ""

    const RESIZE_TIMEOUT = 200
    let windowResizeTimer: NodeJS.Timeout
    function windowResizeInit() {
        if(windowResizeTimer) clearTimeout(windowResizeTimer)
        windowResizeTimer = setTimeout(windowResize, RESIZE_TIMEOUT)
    }

    function windowResize() {
        if(!tableEl || !tableContainer) {
            columnWidthOverride = "auto"
            return
        }

        const BUFFER = checkboxEl ? checkboxEl.offsetWidth + 17 : 17   //Pixel buffer to subtract checkbox width and scrollbar width (estimated 17px) and avoid yoyoing

        if(tableEl.scrollWidth >= tableContainer.offsetWidth) {
            columnWidthOverride = "auto"
        }
        tick().then(()=> {
            if(tableEl.offsetWidth < tableContainer.offsetWidth - BUFFER) {
                let division = (tableContainer.offsetWidth - BUFFER) / columnOrder.length
                columnWidthOverride = division + "px"
            }
        })
    }

    onMount(()=> {
        window.addEventListener("resize", windowResizeInit)
        windowResize()
    })

    onDestroy(()=> {
        window.removeEventListener("resize", windowResizeInit)
    })

    $: columnOrder, windowResizeInit()

    //Handle page change
    async function repaginate() {
        if(!initialLoad) return

        //Handle repagination function (for server pulls on page change)
        let newData: any[]
        if(paginationFunc) newData = await paginationFunc(sourceData)
        if(newData) {
            sourceData = newData    //Reactivity will handle new data setup and sfsp
            return
        }

        sfsp()
    }

    $: page, repaginate()

    //Handle header click (sort)
    function handleHeaderClick(key: string | number) {
        page = 1

        if(sortByKey === key) {
            switch(sortByOrder) {
                case SortOrder.ASC:
                    sortByOrder = SortOrder.DESC
                    break
                case SortOrder.DESC:
                    sortByKey = ""
                    break
                default:
                    sortByOrder = SortOrder.ASC
            }
        }
        else {
            sortByKey = key
            sortByOrder = SortOrder.ASC
        }

        sfsp()
    }

    function setColRow(col: number, row: number) {
        mouse.col = col
        mouse.row = row
        console.log(mouse)
    }

    //Handle checkbox selections
    // function calcSelectedRows() {
    //     if(!sortedData) {
    //         exports.strResults = ""
    //         return
    //     }

    //     let accum = 0
    //     for(let i=0; i<selectedRows.length; i++) { 
    //         if(selectedRows[i]==true) 
    //             accum++ 
    //     }
    //     numSelectedRows = accum

    //     let label = sortedData.length == 1 ? "result" : "results"
    //     if(numSelectedRows > 0) {         
    //         exports.strResults = `${sortedData.length} ${label} (${numSelectedRows} selected)`
    //     }
    //     else exports.strResults = `${sortedData.length} ${label}`

    //     returnSelected()
    // }

    // function selectAllRows() {
    //     if(!sortedData) return

    //     if(selectedRows.length > 0) {
    //         selectedRows = []
    //     }

    //     for(let i=0; i < sortedData.length; i++) {
    //         selectedRows[i] = topcheckboxChecked
    //     }
    // }

    // function returnSelected() {
    //     //Find where in the tableData array this is
    //     let indices = []
    //     sortedData.forEach((row, index)=> {
    //         if(selectedRows[index])
    //             indices.push(row.hmkIndex)
    //     })

    //     dispatch("checked", {indices})
    // }
</script>

<div class={tableClass}>
    <!-- Table-constraining div and table -->
    <div class="table-container" bind:this={tableContainer}>
        <div class="table-wrap">
            <!-- Header row -->
            <slot name="header"></slot>
            <slot name="subheader"></slot>

            <!-- Top pagination UI -->
            {#if showPaginationUI}
                <PaginationUi {backIcon} {forwardIcon} bind:page={page} {totalPages} show={paginationShow} maxResultsPerPage={config.maxResultsPerPage} totalResults={unpaginatedResults}/>
            {/if}
            
            <!-- The table -->
            <div class="table" style:grid-template-columns="{config.showCheckboxes ? "2rem " : ""}repeat({columnOrder.length}, minmax(min-content, max-content))"
                style:min-height={minHeight} style:max-height={maxHeight} style:height={height} bind:this={tableEl}>

                <!-- Column headers -->
                {#if config.showCheckboxes}
                    <div class="col head checkbox" class:row-highlighted={mouse.row === 0} class:col-highlighted={mouse.col === 0} bind:this={checkboxEl} on:mouseenter={()=>setColRow(0,0)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus><input type="checkbox"></div>
                {/if}
                {#each columnOrder as col, idx}
                    <div class="col head" class:row-highlighted={mouse.row === 0} class:col-highlighted={mouse.col === idx+1 } style:min-width={columnWidthOverride} on:click={()=> handleHeaderClick(col)} on:keypress on:mouseenter={()=>setColRow(idx+1, 0)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus><span>{col}</span><span>{@html sortByKey === col ? sortIcons[sortByOrder] : ""}</span></div>
                {/each}
                <!-- Rows -->
                {#if tableData.length}
                    <!-- Each row -->
                    {#each tableData as row, index}
                        <!-- Row checkbox -->
                        {#if config.showCheckboxes}
                            <div class="col field checkbox" class:row-highlighted={mouse.row === index+1} class:col-highlighted={mouse.col === 0} class:even-row={index % 2 === 0} on:mouseenter={()=>setColRow(0,index+1)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus><input type="checkbox"></div>
                        {/if}
                        <!-- Each field -->
                        {#each columnOrder as field, colIdx}
                            <!-- Set clickable class and click function if onclick is present in config -->
                            <div class="col field" class:row-highlighted={mouse.row === index+1} class:col-highlighted={mouse.col === colIdx+1} class:even-row={index % 2 === 0} class:clickable={config.columns[field].onclick !== undefined} on:click={config.columns[field].onclick ? (e)=> config.columns[field].onclick(row[field], row, e) : ()=> true} on:keypress on:mouseenter={()=>setColRow(colIdx+1,index+1)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus>
                                {#if row[field] !== null && row[field] !== undefined}
                                    {#if config.columns[field].type === "date" && config.columns[field].dateFormatFunc}
                                        {#if config.columns[field].html || config.columns[field].extractHtml}
                                            {@html config.columns[field].dateFormatFunc(row[field])}
                                        {:else}
                                            {config.columns[field].dateFormatFunc(row[field])}
                                        {/if}
                                    {:else}
                                        {#if config.columns[field].html || config.columns[field].extractHtml}
                                            {@html row[field]}
                                        {:else}
                                            {row[field]}
                                        {/if}
                                    {/if}
                                {/if}
                            </div>
                        {/each}
                    {/each}
                <!-- If no data, show no data note -->
                {:else}
                    <div class="col field full-row" style:grid-column="1 / span {columnOrder.length + (config.showCheckboxes ? 1 : 0)}">{config.noDataNote ?? "No data present for this criteria"}</div>
                {/if}
            </div>

            <!-- Bottom pagination UI -->
            {#if showPaginationUI && tableData.length}
                <PaginationUi {backIcon} {forwardIcon} bind:page={page} {totalPages} showPageIndices={true} show={paginationShow} maxResultsPerPage={config.maxResultsPerPage} totalResults={unpaginatedResults} sorted={sortedTrigger}/>
            {/if}
        </div>
    </div>
</div>

<style>
    .table-container {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .table-wrap {
        overflow: hidden;
    }

    .table {
        display: grid;
        position: relative;
        align-items: center;
        box-sizing: border-box;
        background: white;
        overflow-x: auto;
        overflow-y: auto;
    }

    .col.checkbox {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: .25rem;
        position:sticky;
        left: 0;
    }

    .col.head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        justify-content: space-between;
    }

    .field, .head {
        display: flex;
        align-items: center;
        padding: .5rem;
        height: 100%;
        box-sizing: border-box;
    }

    .col.checkbox input {
        width: 100%;
        height: 100%;
    }
</style>