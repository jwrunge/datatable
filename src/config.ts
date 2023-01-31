import type { DateTime as DateType } from "luxon"

export enum DateTimeFormats {
    "ISO",
    "HTTP",
    "RFC2822",
    "SQL",
    "MILLIS",
    "SECONDS"
}

export enum FilterComparisons {
    "EQUAL",
    "LT",
    "LTE",
    "GT",
    "GTE",
    "NOT"
}

export interface Filter {
    key: string
    comparison: FilterComparisons
    value: string | DateType | number
    options: any[]
}

export interface Column {
    editable?: boolean
    type?: "string" | "date" | "integer" | "float"
    dateParse?: DateTimeFormats
    dateFormatFunc?: (date: DateType)=> string
    floatPrecision?: number
    options?: any[]
    html?: boolean
    extractHtml?: string | null
    onclick?: Function
    category?: string
}

export interface AddColumn extends Column {
    name?: string
    value?: any
    func: Function
}

export interface Config {
    paginate?: boolean
    maxResultsPerPage?: number,
    columns: {
        [key: string]: AddColumn
    }
    searchable?: string[]
    showCheckboxes?: boolean
    noDataNote?: string,
    columnOrder?: (keyof Config["columns"])[]
}