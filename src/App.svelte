<script lang="ts">
  import { DateTimeFormats, type Config } from "./config"
  import DataTable from "./DataTable.svelte"

  let search = ""

  const jsondata = [
    {
      name: "Jake",
      profession: "Software Engineer",
      age: 35,
      born: Date.parse("10/08/1987 8:00 PM"),
      number: 77658572
    },
    {
      name: "Mary",
      profession: "Pastoral Care",
      age: 34,
      born: 571557600000,
      number: 1000
    },
    {
      name: "Isaac",
      profession: "Car Smasher",
      age: 3,
      born: "2019-07-30",
      number: 3000
    },
    {
      name: "Elinor",
      profession: "Artist",
      age: 1,
      born: "2021-10-04",
      number: 3000
    }
  ]

  for(let idx=0; idx < 100; idx++) {
    jsondata.push({
      name: "#" + idx,
      profession: idx.toString(),
      age: idx,
      born: 0,
      number: idx * idx
    })
  }

  const config: Config = {
    showCheckboxes: true,
    paginate: true,
    maxResultsPerPage: 10,
    columns: {
      Name: {
        func: (row: any)=> row.name
      },
      Profession: {
        func: (row: any)=> row.profession
      },
      Age: {
        func: (row: any)=> row.age,
        type: "integer"
      },
      Born: {
        func: (row: any)=> `<em>${row.born}</em>`,
        type: "date",
        dateParse: DateTimeFormats.SQL,
        extractHtml: "em"
      },
      Number: {
        func: (row: any)=> `<strong>${row.number}</strong>`,
        extractHtml: "strong",
        type: "integer"
      },
      Another: {
        func: (row: any)=> row.age * row.number,
        type: "integer"
      }
    }
  }

  let page = 5
</script>

<main>
  <!-- <DataTable sourceData={jsondata} config={config} searchEntry={search} showPaginationUI={true} paginationShow="results" {page}>
    <div slot="header"><h2>My Table</h2></div>
    <div slot="subheader"><input type="text" bind:value={search}></div>
  </DataTable> -->
</main>
