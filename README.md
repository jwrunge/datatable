# datatable

## install

`npm install @jwrunge/datatable turndown showdown html-to-text fuse.js dompurify -S`

## inputs

export let sourceData
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

export let configuration = null