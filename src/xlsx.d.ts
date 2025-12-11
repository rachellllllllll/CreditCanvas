declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: any };
  }
 
  export const read: (data: any, opts?: any) => WorkBook;
  export const write: (wb: WorkBook, opts?: any) => any;
 
  export const utils: {
    sheet_to_json: (sheet: any, opts?: any) => any[];
    encode_cell: (cell: { c: number; r: number }) => string;
  };
}