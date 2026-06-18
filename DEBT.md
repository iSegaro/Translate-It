### Pause Translation Optimization

Current behavior:

- Pause keeps session alive.
- Late final transcript events are still translated.
- Overlay suppresses display while paused.

Potential future optimization:

- Skip translation dispatch while session state is PAUSED.
- Continue recording transcript segments and cache.
- Resume translation processing when session returns to RUNNING.

Priority: Low
Reason: Only affects a small number of late-arriving final segments after pause.
