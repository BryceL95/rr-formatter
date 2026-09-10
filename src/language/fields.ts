/**
 * Known roots of RACE RESULT data-field references.
 *
 * Field names are open-ended (events define their own results, splits, ranks
 * and user-defined fields), so this is deliberately *not* an exhaustive list --
 * it only covers the structural roots that are worth colouring distinctly, plus
 * the participant fields that exist in every event.
 *
 * Reference: https://www.raceresult.com/en-us/support/kbexport2?id=1192
 */

/** Roots that introduce a dotted namespace, e.g. `[Contest.Name]`. */
export const NAMESPACE_ROOTS: readonly string[] = [
    'Event', 'Contest', 'AgeGroup', 'AgeGroup2', 'AgeGroup3',
    'Time', 'Time0', 'Invoice', 'Voucher', 'OP'
];

/**
 * Roots that are a bare prefix followed by an index, e.g. `[T5]`, `[TS2.Rank]`,
 * `[Time3.Decimal]`. Written as a regex source fragment.
 */
export const INDEXED_ROOT_PATTERN = '(?:TS|TR|T|Time|Rank)[0-9]+';

/** Participant and derived fields present in every event. */
export const PARTICIPANT_FIELDS: readonly string[] = [
    'Bib', 'Lastname', 'Firstname', 'Title', 'YearOfBirth', 'YearOfBirth2',
    'DateOfBirth', 'Gender', 'Sex', 'Nation', 'Club', 'License', 'Status',
    'StatusText', 'Comment', 'Transponder1', 'Transponder2', 'RegNo', 'Street',
    'ZIP', 'City', 'State', 'Country', 'Email', 'Phone', 'CellPhone', 'Language',
    'ID', 'AccountOwner', 'AccountNo', 'AccountNoX', 'BranchNo', 'Bank', 'IBAN',
    'IBANX', 'BIC', 'SEPAMandate', 'Created', 'CreatedBy', 'Modified',
    'GroupRegPos', 'GroupID', 'Age', 'AgeOnDec31', 'LastFirstName',
    'FirstLastName', 'Random', 'TransponderInChipfile', 'Eligible', 'Started',
    'Finished', 'EntryFee', 'BasicFee', 'EntryFeePaid', 'PaidEntryFee',
    'FinishTimeLimit', 'FinishTimeLimitText'
];

const NAMESPACE_SET = new Set(NAMESPACE_ROOTS.map((r) => r.toLowerCase()));
const INDEXED_ROOT_RE = new RegExp(`^${INDEXED_ROOT_PATTERN}$`, 'i');

/**
 * Splits a field reference body into its dotted segments and reports which
 * leading segments form a namespace, so `[Contest.Name]` can colour `Contest`
 * differently from `Name`.
 */
export function isNamespaceSegment(segment: string): boolean {
    return NAMESPACE_SET.has(segment.toLowerCase()) || INDEXED_ROOT_RE.test(segment);
}
