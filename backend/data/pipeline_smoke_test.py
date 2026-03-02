from sentiment_analyzer import SentimentAnalyzer


def main() -> None:
    analyzer = SentimentAnalyzer()
    sample_threads = [
        {
            "title": "Easy elective recommendation",
            "selftext": "I found EM203 straightforward and manageable.",
            "score": 10,
            "num_comments": 3,
            "created": "2025-01-01T00:00:00Z",
        }
    ]

    analyzed = analyzer.analyze_threads(sample_threads)
    rankings = analyzer.get_course_rankings(analyzed)

    if not isinstance(analyzed, list) or not isinstance(rankings, list):
        raise RuntimeError("Smoke test failed: analyzer outputs were not list types")

    print("Pipeline smoke test passed.")


if __name__ == "__main__":
    main()
