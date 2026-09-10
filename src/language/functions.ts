/**
 * Canonical catalogue of RACE RESULT functions.
 *
 * This is the single source of truth for the whole extension: the formatter
 * uses it to normalise casing, the semantic token provider uses it to mark
 * known functions, and `tools/gen-grammar.ts` generates the TextMate grammar
 * from it. Never duplicate a name list anywhere else.
 *
 * Reference: https://www.raceresult.com/en-us/support/kbexport2?id=1192
 */

export type FunctionCategory =
    | 'control'
    | 'string'
    | 'math'
    | 'result'
    | 'conversion'
    | 'datetime'
    | 'check'
    | 'inter-record'
    | 'scoring'
    | 'other';

/** Function names grouped by the categories the knowledge base uses. */
export const FUNCTIONS_BY_CATEGORY: Record<FunctionCategory, readonly string[]> = {
    control: ['if', 'switch', 'choose'],

    string: [
        'left', 'right', 'mid', 'instr', 'instr2', 'val', 'len', 'lcase', 'ucase',
        'trim', 'string', 'replace', 'reduceChars', 'removeAccents', 'chr', 'asc',
        'ordinal', 'similarity', 'CorrectSpelling', 'stringCount', 'SplitString'
    ],

    math: ['int', 'sqrt', 'quersumme', 'abs', 'round', 'speed', 'pace'],

    result: [
        'T', 'TR', 'TName', 'TText', 'TPrev', 'DMaxMin',
        'TCount', 'TCountIf', 'TTCount',
        'TSum', 'TRSum', 'TTSum', 'TTRSum',
        'TMin', 'TRMin', 'TMinID', 'TMinText', 'TMinName', 'TMinIf', 'TMinIfID',
        'TTMin', 'TTRMin', 'TTMinID', 'TTMinText', 'TTMinName', 'TTMinIndex',
        'TMax', 'TRMax', 'TMaxID', 'TMaxText', 'TMaxName', 'TMaxIf', 'TMaxIfID',
        'TTMax', 'TTRMax', 'TTMaxID', 'TTMaxText', 'TTMaxName', 'TTMaxIndex',
        'TAvg', 'TRAvg', 'TTAvg', 'TTRAvg',
        'TFirst', 'TRFirst', 'TFirstID', 'TFirstText', 'TFirstName',
        'TTFirst', 'TTRFirst', 'TTFirstID', 'TTFirstText', 'TTFirstName', 'TTFirstIndex',
        'TLast', 'TRLast', 'TLastID', 'TLastText', 'TLastName',
        'TTLast', 'TTRLast', 'TTLastID', 'TTLastText', 'TTLastName', 'TTLastIndex'
    ],

    conversion: ['urlencode', 'NumberToWords', 'ZahlInWort', 'TimeFromString', 'md5', 'crc7'],

    datetime: ['format', 'date', 'now', 'ElapsedTime', 'AgeOnDate'],

    check: [
        'inRange', 'isNumeric', 'isAlpha', 'hasChip', 'ChipFileHas', 'search',
        'isUCICode', 'isUCIID', 'hasEntryFee', 'isEligible', 'isValidEmail'
    ],

    'inter-record': [
        'BunchTime', 'GapTimeTop', 'GapTimePrev', 'GapTimeLast', 'GapTimeNext',
        'TeamGapTimeTop', 'TeamGapTimePrev',
        'DCount', 'DCountDistinct', 'DSum', 'DMin', 'DAvg', 'DMax',
        'DFirst', 'DLast', 'DConcat', 'DQuantile'
    ],

    scoring: [
        'AgeGradedOC2015', 'AgeGradedLevel2015', 'AgeGradedFactor2015',
        'AgeGradedOC2020', 'AgeGradedLevel2020', 'AgeGradedFactor2020',
        'AgeGradedOC2025', 'AgeGradedLevel2025', 'AgeGradedFactor2025'
    ],

    other: [
        'nz', 'min', 'max', 'first', 'last', 'table', 'Setting', 'GetSex',
        'translate', 'Rank', 'RankMax', 'Text', 'ChangeLink', 'EntryFeeMatrix'
    ]
};

/** Every function name, in canonical casing. */
export const FUNCTION_NAMES: readonly string[] = Object.values(FUNCTIONS_BY_CATEGORY).flat();

/** lower-cased name -> canonical casing. */
const CANONICAL_BY_LOWER = new Map<string, string>(
    FUNCTION_NAMES.map((name) => [name.toLowerCase(), name])
);

const CATEGORY_BY_LOWER = new Map<string, FunctionCategory>(
    (Object.entries(FUNCTIONS_BY_CATEGORY) as [FunctionCategory, readonly string[]][]).flatMap(
        ([category, names]) => names.map((name) => [name.toLowerCase(), category] as const)
    )
);

/** True when `name` is a documented RACE RESULT function (case-insensitive). */
export function isKnownFunction(name: string): boolean {
    return CANONICAL_BY_LOWER.has(name.toLowerCase());
}

/** The official casing for `name`, or `name` unchanged when it isn't a known function. */
export function canonicalFunctionName(name: string): string {
    return CANONICAL_BY_LOWER.get(name.toLowerCase()) ?? name;
}

export function functionCategory(name: string): FunctionCategory | undefined {
    return CATEGORY_BY_LOWER.get(name.toLowerCase());
}

/** Control-flow functions, which read better expanded one argument per line. */
export function isControlFunction(name: string): boolean {
    return functionCategory(name) === 'control';
}
