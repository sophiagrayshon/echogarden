# How to help

So far, this project has been the solo work of a single person.

However, there are many areas where contributions can be made.

## Report any issue or bug you encounter

First, check out the [task list](Tasklist.md) to see if the problem is already known to me. The task list allows me to efficiently document and organize a large quantity of small issues, enhancements or ideas that would otherwise flood an issue tracker with lots of unimportant entries, be ignored, or forgotten entirely.

If you find the issue you're encountering in the task list, you can still open an issue to discuss it. This allows me to know that someone cares about a particular issue, and I may give it higher priority.

There might be some obvious errors that have gone unreported. Especially if:
* You're using the macOS platform: I don't have access to a macOS machine, and thus almost no real testing has been done over that platform.
* You're using cloud services: There may be changes in the service that will require updating the code. I don't often test they work correctly, since my trial periods in Google, Microsoft and Amazon have all expired, thus testing requires me to use payed requests.

In any case, please let me know if you get any unexpected error message or surprising behavior that you care about, and I'll try to prioritize it, if possible.

## Report odd TTS pronunciations and other fail cases

When you encounter an odd pronunciation in a VITS voice, there are several possible causes:

1. An incorrect phonemization produced by the eSpeak engine. Fortunately, it can be overridden by adding a corrected pronunciation to an Echogarden lexicon. You can pass one or more custom lexicons files to the VITS engine via `vits.customLexiconPaths` and see if it solves the problem. The lexicon format is the same as in [this file](https://github.com/echogarden-project/echogarden/blob/main/data/lexicons/heteronyms.en.json) - you can use it as a reference.
1. This word has multiple different pronunciations based on context (a heteronym). In that case, it may be possible resolve the pronunciations based on context, by using the preceding and succeeding words as indicators. This is supported by the lexicon in the `precededBy`, `notPrecededBy`, `succeededBy`, `notSucceededBy` properties.
1. An issue with model training, which may need to be forwarded to the original authors.

If the problem is serious, you can report it and we'll see what we can do.
