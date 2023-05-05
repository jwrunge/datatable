<script lang="ts">
    import type { Config, Filter } from "./config"
    import { loadData, setupSearch, search, sortBy, filter, paginate, SortOrder, downloadCsv } from "./processing"
    import PaginationUi from "./PaginationUI.svelte"
    import { createEventDispatcher } from "svelte"
    import ContextMenu from "./ContextMenu.svelte"

    const dispatch = createEventDispatcher()

    export let csvRequest: boolean = false
    export let csvTitle: string

    //Context menu stuff
    interface contextButtons {
        name: string,
        func: Function
    }
    export let rowContextButtons: contextButtons[]

    let contextMenuOps: {
        mouseX: number, mouseY: number,
        row: any, col: string | number
    } = {
        mouseX: 0,
        mouseY: 0,
        row: {},
        col: ""
    }

    let ctx: "column" | "row" | "" = ""

    //Handle csv download requests
    $: {
        if(csvRequest === true) {
            downloadCsv(sourceData, csvTitle, config.columns)
            csvRequest = false
        }
    }

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
        searchable: undefined,
        noDataNote: "No data available"
    }
    let tableData: any[] = []
    export let columnOrder: (keyof Config["columns"])[] = []

    let tableEl: HTMLElement
    let checkboxEl: HTMLElement

    export let searchEntry: string = ""
    let fuseSearch: any
    let sortByKey: keyof Config["columns"] = ""
    let sortByOrder: SortOrder = SortOrder.DEFAULT

    //Pagination function (for fetching from the server)
    export let paginationFunc: Function | undefined = undefined
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

    //Search, filter, sort, paginate
    async function sfsp() {
        //Initial load set on first sfsp
        initialLoad = true

        //Search, filter, sort
        if(searchEntry)
            tableData = search(searchEntry, fuseSearch) ?? sourceData.slice(0)
        else
            tableData = sourceData.slice(0)
        // if(filters && filters.length) tableData = filter(tableData, config.columns, filters)
        if(sortByKey) tableData = sortBy(tableData, sortByKey, sortByOrder, config.columns)
        totalResults = tableData.length //Get the pre-paginated total results

        //Paginate
        unpaginatedResults = tableData.length
        let pagination = paginate(tableData, page, totalResultsOverride || totalResults, config)    //Allow total results override in case source has unloaded database information
        tableData = pagination.data
        totalPages = pagination.totalPages || 1
        pageResults = tableData.length

        sortedTrigger = !sortedTrigger

        try {
            dispatch("sorted", sourceData)
        }
        catch(e) {
            console.error(e)
        }
    }

    let gridRepeat: string

    function changeData(sourceData: any) {
        let data = loadData(sourceData, config)
        if(data) return data
    }

    $: {
        try {
            sourceData = changeData(sourceData)
            tableData = JSON.parse(JSON.stringify(sourceData))
            sfsp()
        }
        catch(e) {
            console.warn("Datatable aborted update", e)
        }
    }

    //On config or sourceDat change
    $: {
        gridRepeat = `${config.showCheckboxes ? "2rem " : ""}repeat(${columnOrder.length}, minmax(max-content, 1fr))`
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

    //Handle page change
    async function repaginate(_: number) {
        if(!initialLoad) return

        //Handle repagination function (for server pulls on page change)
        let newData: any[]
        if(paginationFunc) {
            newData = await paginationFunc(sourceData)
        
            if(newData) {
                sourceData = newData    //Reactivity will handle new data setup and sfsp
                return
            }

            sfsp()
        }
        else sfsp()
    }

    $: repaginate(page)

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

    function setColRow(col: number | undefined, row: number | undefined) {
        mouse.col = col
        mouse.row = row
    }

    //Handle column drag
    //Dragging
    let dragging: string | number = ""
    async function drop_trade(dropOn: string | number) {
        if(!dragging || !Array.isArray(columnOrder)) return
        if(dragging == dropOn) return

        //Reorder within array
        let draggingIdx = columnOrder.indexOf(dragging)
        let dropOnIdx = columnOrder.indexOf(dropOn)

        let co = JSON.parse(JSON.stringify(columnOrder))
        co.splice(draggingIdx, 1)
        co.splice(dropOnIdx, 0, dragging)

        columnOrder = co

        dispatch("sorted", sourceData)

        //Clear dragging
        // dragging = ""
    }

    function preventBehavior(e: Event) {
        e.preventDefault()
    }

    let touchCtxTimeout: any

    //Detect iOS - from Pierre @ https://stackoverflow.com/questions/9038625/detect-if-device-is-ios
    function iOS() {
        return [
            'iPad Simulator',
            'iPhone Simulator',
            'iPod Simulator',
            'iPad',
            'iPhone',
            'iPod'
        ].includes(navigator.platform)
        // iPad on iOS 13 detection
        || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
    }

    function queueHeaderContextMenu(e: TouchEvent, col: string | number) {
        if(!iOS()) return
        if(touchCtxTimeout) clearTimeout(touchCtxTimeout)
        touchCtxTimeout = setTimeout(()=> {
            handleHeaderContextMenu({ clientX: e.touches[0]?.clientX, clientY: e.touches[0]?.clientY } as unknown as MouseEvent, col)
        }, 500)
    }

    function handleHeaderContextMenu(e: MouseEvent, column: string | number) {
        contextMenuOps.col = column
        contextMenuOps.mouseX = e.clientX
        contextMenuOps.mouseY = e.clientY
        contextMenuOps.row = null

        ctx = "column"
    }

    function queueRowContextMenu(e: TouchEvent, row: any, column: string | number) {
        if(!iOS()) return
        if(touchCtxTimeout) clearTimeout(touchCtxTimeout)
        touchCtxTimeout = setTimeout(()=> {
            handleRowContextMenu({ clientX: e.touches[0]?.clientX, clientY: e.touches[0]?.clientY } as unknown as MouseEvent, row, column)
        }, 500)
    }

    function handleRowContextMenu(e: MouseEvent, row: any, column: string | number) {
        contextMenuOps.col = column
        contextMenuOps.mouseX = e.clientX
        contextMenuOps.mouseY = e.clientY
        contextMenuOps.row = row

        ctx = "row"
    }

    function endTouchContext() {
        if(touchCtxTimeout) clearTimeout(touchCtxTimeout)
    }

    //Handle checkbox selections
    // function calcSelectedRows() {
    //     if(!sourceData) {
    //         exports.strResults = ""
    //         return
    //     }

    //     let accum = 0
    //     for(let i=0; i<selectedRows.length; i++) { 
    //         if(selectedRows[i]==true) 
    //             accum++ 
    //     }
    //     numSelectedRows = accum

    //     let label = sourceData.length == 1 ? "result" : "results"
    //     if(numSelectedRows > 0) {         
    //         exports.strResults = `${sourceData.length} ${label} (${numSelectedRows} selected)`
    //     }
    //     else exports.strResults = `${sourceData.length} ${label}`

    //     returnSelected()
    // }

    // function selectAllRows() {
    //     if(!sourceData) return

    //     if(selectedRows.length > 0) {
    //         selectedRows = []
    //     }

    //     for(let i=0; i < sourceData.length; i++) {
    //         selectedRows[i] = topcheckboxChecked
    //     }
    // }

    // function returnSelected() {
    //     //Find where in the tableData array this is
    //     let indices = []
    //     sourceData.forEach((row, index)=> {
    //         if(selectedRows[index])
    //             indices.push(row.hmkIndex)
    //     })

    //     dispatch("checked", {indices})
    // }
</script>

<div class="{tableClass} table-wrapper">
    <div class="table-head">
        <!-- Header row -->
        <slot name="header"></slot>
        <slot name="subheader"></slot>
        <!-- Top pagination UI -->
        <!-- {#if showPaginationUI}
            <PaginationUi {backIcon} {forwardIcon} bind:page={page} {totalPages} show={paginationShow} maxResultsPerPage={config.maxResultsPerPage} totalResults={unpaginatedResults}/>
        {/if} -->
    </div>

    <!-- The table -->
    <div class="table" style:grid-template-columns={gridRepeat} bind:this={tableEl}>
        <!-- Column headers -->
        {#if config.showCheckboxes}
            <div class="col head checkbox" class:row-highlighted={mouse.row === 0} class:col-highlighted={mouse.col === 0} bind:this={checkboxEl} on:mouseenter={()=>setColRow(0,0)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus><input type="checkbox"></div>
        {/if}
        {#each columnOrder as col, idx}
            <div draggable={true} class:draggedOver={config?.columns[col]?.entered} class="col head" class:row-highlighted={mouse.row === 0} class:col-highlighted={mouse.col === idx+1 } style:min-width={columnWidthOverride} 
                on:click={()=> handleHeaderClick(col)} on:keypress on:mouseenter={()=>setColRow(idx+1, 0)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus 
                on:dragstart={()=> { ctx = ""; console.log("DRAGSTART"); dragging = col; }}
                on:dragenter={()=> {console.log(col); config.columns[col].entered = true; drop_trade(col) }}
                on:dragover
                on:dragleave={()=> { config.columns[col].entered = false }}
                on:drop|preventDefault={()=> { dragging = ""; document.removeEventListener("touchstart", preventBehavior); }}
                on:touchend|stopPropagation={()=> endTouchContext()}
                on:touchmove|stopPropagation={(e)=> { endTouchContext() }}
                on:touchstart|stopPropagation={(e)=> queueHeaderContextMenu(e, col)}
                on:contextmenu|preventDefault|stopPropagation={(e)=> handleHeaderContextMenu(e, col) }
            >
                    <span>{col}</span>
                    <span>{@html sortByKey === col ? sortIcons[sortByOrder] : ""}</span>
            </div>
        {/each}
        <!-- Rows -->
        {#if tableData.length}
            <!-- Each row -->
            {#each filter(tableData, config.columns, filters) as row, index}
                <!-- Row checkbox -->
                {#if config.showCheckboxes}
                    <div class="col field checkbox" class:row-highlighted={mouse.row === index+1} class:col-highlighted={mouse.col === 0} class:even-row={index % 2 === 0} on:mouseenter={()=>setColRow(0,index+1)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus><input type="checkbox"></div>
                {/if}
                <!-- Each field -->
                {#each columnOrder as field, colIdx}
                    <!-- Set clickable class and click function if onclick is present in config -->
                    <div class="col field" 
                        on:contextmenu|preventDefault|stopPropagation={(e)=> handleRowContextMenu(e, row._originalData, field)} 
                        on:touchend|stopPropagation={()=> endTouchContext()}
                        on:touchmove|stopPropagation={()=> endTouchContext()}
                        on:touchstart|stopPropagation={(e)=> queueRowContextMenu(e, row._originalData, field)}
                        class:row-highlighted={mouse.row === index+1} class:col-highlighted={mouse.col === colIdx+1} class:even-row={index % 2 === 0} 
                        class:clickable={config?.columns[field]?.onclick !== undefined} 
                        on:click={config.columns[field].onclick ? (e)=> config?.columns[field]?.onclick(row[field], row._originalData, e) : ()=> true} 
                        on:keypress on:mouseenter={()=>setColRow(colIdx+1,index+1)} on:mouseleave={()=>setColRow(undefined, undefined)} on:focus
                    >
                        {#if row[field] !== null && row[field] !== undefined}
                            {#if config.columns[field].type === "date" && config.columns[field].dateFormatFunc}
                                {#if config?.columns[field]?.html || config?.columns[field]?.extractHtml}
                                    {@html config?.columns[field]?.dateFormatFunc(row[field])}
                                {:else}
                                    { config?.columns[field]?.dateFormatFunc(row[field]) }
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
            <div class="col field full-row" style:grid-column="1 / span {(columnOrder.length || 1) + (config.showCheckboxes ? 1 : 0)}">{config.noDataNote ?? "No data present for this criteria"}</div>
        {/if}
    </div>

    <!-- Bottom pagination UI -->
    {#if showPaginationUI && tableData.length}
        <PaginationUi {backIcon} {forwardIcon} bind:page={page} {totalPages} showPageIndices={true} show={paginationShow} maxResultsPerPage={config.maxResultsPerPage} totalResults={unpaginatedResults} sorted={sortedTrigger}/>
    {/if}
</div>

{#if ctx !== ""}
    {#if ctx !== "row" || rowContextButtons?.length > 0}
        <ContextMenu mouseX={contextMenuOps.mouseX} mouseY={contextMenuOps.mouseY} col={contextMenuOps.col} row={contextMenuOps.row} context={ctx} {rowContextButtons}
            on:add={()=> { dispatch("changeColumns") }}
            on:close_column={e=> { columnOrder = columnOrder.filter(c=> c != e.detail) }} 
            on:close={()=> ctx = ""}>
        </ContextMenu>
    {/if}
{/if}

<style>
    .table-wrapper {
        display: grid;
        grid-template-rows: max-content 1fr;
        grid-template-columns: 1fr;
    }

    .table {
        display: grid;
        grid-auto-rows: max-content;
        position: relative;
        align-items: center;
        justify-content: stretch;
        box-sizing: border-box;
        background: white;
        overflow-x: auto;
        overflow-y: auto;
        width: 100%;
        height: 100%;
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

    @media (hover: none) {
        .col {
            -webkit-user-select: none; /* Safari */
            -ms-user-select: none; /* IE 10+ */
            user-select: none;
        }
    }
</style>