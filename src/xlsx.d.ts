declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
  }
  
  export interface WorkSheet {
    [cell: string]: CellObject | any;
  }
  
  export interface CellObject {
    t: string;
    v: any;
    w?: string;
  }
  
  export function read(data: any, opts?: any): WorkBook;
  export function write(wb: WorkBook, opts?: any): any;
  
  export namespace utils {
    function sheet_to_json(sheet: WorkSheet, opts?: any): any[];
    function encode_cell(cell: { c: number; r: number }): string;
  }
}
