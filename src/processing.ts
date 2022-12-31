import { DateTimeFormats, type Config, type Column, type Filter, FilterComparisons } from "./config"
import Fuse from "fuse.js"
import { DateTime, type DateTime as DateType } from "luxon"

export enum SortOrder {
    DEFAULT,
    ASC,
    DESC
}

//Handle type conversion
export function toType<Type>(t: Column["type"], value: any, cfg: Column): Type {
    //Handle bad value
    if(value === undefined || value === null) {
        return value
    }

    //Set up date conversion
    let converted: Type

    function fromDateFormat(format: DateTimeFormats, date: string): DateType {
        switch(format) {
            case DateTimeFormats.ISO:
                return DateTime.fromISO(date)
            case DateTimeFormats.HTTP || DateTimeFormats.RFC2822:
                return DateTime.fromHTTP(date)
            case DateTimeFormats.SQL:
                return DateTime.fromSQL(date)
            default:
                return DateTime.fromHTTP(date)
        }
    }

    //Type swap
    switch(t) {
        case "string":
            converted = typeof value === "string" ? value as Type : (value as number | Date).toString() as Type
            break
        case "integer":
            converted = typeof value === "number" ? value as Type :
                        value instanceof Date ? Date.parse(value as any) as Type  :
                        typeof value === "string" ? parseInt(value) as Type :
                        0 as Type 
            break
        case "float":
            converted = typeof value === "number" ? (value * 1.0) as Type :
                        value instanceof Date ? (Date.parse(value as any) * 1.0) as Type  :
                        typeof value === "string" ? parseFloat(value) as Type : 
                        0.0 as Type 
            if(cfg.floatPrecision !== undefined) converted = parseFloat((converted as number).toFixed(cfg.floatPrecision).toString()) as Type
            break
        case "date":
            converted = value instanceof Date ? DateTime.fromJSDate(value) as Type :
                        typeof value === "number" ? DateTime.fromMillis(value) as Type : 
                        typeof value === "string" ? fromDateFormat(cfg.dateParse ?? DateTimeFormats.HTTP, value) as Type : 
                        DateTime.fromMillis(0) as Type
    }

    return converted
}

//Handle html extraction
export function extractHtml<Type>(value: Type, cfg: Column): Type {
    //Account for HTML formatting
    if(!cfg.extractHtml) return value

    //Create element to get innerText
    let div = document.createElement("div")
    div.innerHTML = typeof value === "string" ? value.trim() : (value as number | Date).toString()

    //Handle html extraction
    try {
        if(cfg.extractHtml) {
            try {
                let ext = div.querySelector(cfg.extractHtml) as HTMLElement
                return toType(cfg.type, ext.innerText, cfg)
            }
            catch(e) {
                return toType(cfg.type, div.innerText, cfg)
            }
        }
        else {
            return toType(cfg.type, div.innerText, cfg)
        }
    }
    catch(e) {
        return toType(cfg.type, value, cfg)
    }
}

//Initial data load or data reload
export function loadData<Type>(data: Type[], cfg: Config): (Partial<Type> & any) {
    let transformed: (Partial<Type> & any)[] = []

    //Loop through data, applying transforms
    for(let row of data) {
        let transformedRow: (Partial<Type> & any) = {}

        //Loop through specified columns for this row
        for(let col in cfg.columns) {
            //Construct push data
            let newKey = cfg.columns[col].name ?? col

            let newVal
            if(cfg.columns[col].value) newVal = cfg.columns[col].value
            else newVal = cfg.columns[col].func(row)

            //Set type, if not explicit
            if(!cfg.columns[col].type) cfg.columns[col].type = "string"
            if(!cfg.columns[col].dateFormatFunc) cfg.columns[col].dateFormatFunc = (date: DateType)=> date.toLocaleString(DateTime.DATETIME_SHORT)

            //Add value -- convert to type if not HTML formatted
            transformedRow[newKey] = cfg.columns[col].extractHtml ? newVal : toType(cfg.columns[col].type, newVal, cfg.columns[col])
        }

        //Push
        transformed.push(transformedRow)
    }

    return transformed
}

//Set up fuse search object
export function setupSearch<Type>(data: Type[], keys: string[], cfg: Config) {
    if(typeof keys === "string") {
        if(keys === "all") {
            if(!data || !data[0] || !Object.keys(data[0])) keys = []
            else keys = Object.keys(data[0])
        }
        else {
            keys = []
        }
    }
    else {
        //Don't search dates
        keys = keys.filter(k=> {
            return cfg.columns[k as keyof Config["columns"]].type !== "date"
        })
    }

    if(!keys) keys = []

    let options: Fuse.IFuseOptions<Type> = {
        includeScore: false,
        keys
    }

    //Set up fuse.js fuzzy search
    return new Fuse(data, options)
}

//Search with fuse search object
export function search<Type>(searchTerm: string, f: Fuse<Type>): Type[] | null {
    if(!searchTerm) return null
    let res = f.search(searchTerm)
    return res.map(fr=> fr.item)
}

//Sort
export function sortBy<Type>(data: Type[], key: keyof Type, order: SortOrder, cfg: Config["columns"]): Type[] {
    //Allow no sort
    if(order === SortOrder.DEFAULT) return data

    //The sort function
    function s(a: Type, b: Type): number {
        let aKey = extractHtml(a[key], cfg[key as keyof Config["columns"]])
        let bKey = extractHtml(b[key], cfg[key as keyof Config["columns"]])

        //Sort
        let sortOrder = 1
        if(order == SortOrder.DESC) sortOrder = -1
        if(aKey > bKey) return 1 * sortOrder
        else if(aKey < bKey) return -1 * sortOrder
        else return 0
    }

    return data.sort(s)
}

export function filter<Type>(data: Type[], filters: Filter[]): Type[] {
    let tempData: Type[]

    //Run tests for each filter
    tempData = data.filter((row: Type) => {
        let validRow = true

        for(let f of filters) {
            if(!row[f.key as keyof Type]) return
            if(typeof f.value === typeof row[f.key as keyof Type]) {
                switch(f.comparison) {
                    case FilterComparisons.EQUAL:
                        return row[f.key as keyof Type] === f.value
                    case FilterComparisons.GT:
                        return row[f.key as keyof Type] > f.value
                    case FilterComparisons.GTE:
                        return row[f.key as keyof Type] >= f.value
                    case FilterComparisons.LT:
                        return row[f.key as keyof Type] < f.value
                    case FilterComparisons.LTE:
                        return row[f.key as keyof Type] <= f.value
                    case FilterComparisons.NOT:
                        return row[f.key as keyof Type] !== f.value
                    default:
                        return true
                }
            }
        }

        return validRow
    })

    return tempData
}

export function paginate<Type>(data: Type[], onPage: number, totalResults: number, cfg: Config): { data: Type[], totalPages: number } {
    let totalPages = 1
    let paginatedData: Type[] = data

    //Handle no pagination
    if(!cfg.paginate) return { data: paginatedData, totalPages }

    //Paginate
    let startPageAt = (onPage - 1) * cfg.maxResultsPerPage
    let endPageAt = cfg.maxResultsPerPage + startPageAt

    paginatedData = paginatedData.slice(startPageAt, endPageAt)

    //Determine if there are more pages
    totalPages = Math.ceil(totalResults / cfg.maxResultsPerPage)

    //Return data and pagination metadata
    return { data: paginatedData, totalPages }
}
