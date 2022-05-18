// deno-lint-ignore-file
declare interface RowDataPacket {
    constructor: {
        name: 'RowDataPacket'
    };
    [column: string]: any;
    [column: number]: any;
}

export = RowDataPacket;
