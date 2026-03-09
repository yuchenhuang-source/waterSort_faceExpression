/**
 * Object-wise CV ID generator. IDs are assigned per object instance, position-independent.
 * Reset at game start so each session gets a fresh sequence.
 */
let _nextCvId = 0;

export function nextCvId(): number {
    return _nextCvId++;
}

export function resetCvIds(): void {
    _nextCvId = 0;
}
