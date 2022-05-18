// Manually extracted from mysql-5.5.23/include/mysql_com.h
export const NOT_NULL = 1; /* Field can't be NULL */
export const PRI_KEY = 2; /* Field is part of a primary key */
export const UNIQUE_KEY = 4; /* Field is part of a unique key */
export const MULTIPLE_KEY = 8; /* Field is part of a key */
export const BLOB = 16; /* Field is a blob */
export const UNSIGNED = 32; /* Field is unsigned */
export const ZEROFILL = 64; /* Field is zerofill */
export const BINARY = 128; /* Field is binary   */

/* The following are only sent to new clients */
export const ENUM = 256; /* field is an enum */
export const AUTO_INCREMENT = 512; /* field is a autoincrement field */
export const TIMESTAMP = 1024; /* Field is a timestamp */
export const SET = 2048; /* field is a set */
export const NO_DEFAULT_VALUE = 4096; /* Field doesn't have default value */
export const ON_UPDATE_NOW = 8192; /* Field is set to NOW on UPDATE */
export const NUM = 32768; /* Field is num (for clients) */
