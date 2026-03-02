import nltk


RESOURCES = {
    "vader_lexicon": ["sentiment/vader_lexicon.zip", "sentiment/vader_lexicon"],
    "punkt": ["tokenizers/punkt"],
    "stopwords": ["corpora/stopwords", "corpora/stopwords.zip"],
    "wordnet": ["corpora/wordnet", "corpora/wordnet.zip"],
}


def main() -> None:
    for resource in RESOURCES:
        print(f"Downloading/checking {resource}...")
        nltk.download(resource, quiet=False)

    missing = []
    for name, candidate_paths in RESOURCES.items():
        found = False
        for path in candidate_paths:
            try:
                nltk.data.find(path)
                found = True
                break
            except LookupError:
                continue
        if not found:
            missing.append(name)

    if missing:
        joined = ", ".join(missing)
        raise SystemExit(
            f"NLTK bootstrap failed. Missing resources after download attempt: {joined}"
        )

    print("NLTK bootstrap complete.")


if __name__ == "__main__":
    main()
