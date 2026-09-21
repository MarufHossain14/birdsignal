import unittest

from course_details_analyzer import merge_with_existing_details


class CourseDetailsRefreshTests(unittest.TestCase):
    def test_partial_refresh_keeps_historical_threads(self):
        existing = {
            "code": "BU111",
            "specific_mentions": 2,
            "bird_score": 4.0,
            "threads": [
                {
                    "title": "Older post",
                    "url": "https://example.test/old",
                    "created": "2024-01-01T00:00:00Z",
                    "evidence_score": 5.0,
                },
                {
                    "title": "Shared post",
                    "url": "https://example.test/shared",
                    "created": "2025-01-01T00:00:00Z",
                    "score": 12,
                    "evidence_score": 6.0,
                },
            ],
        }
        refreshed = {
            "code": "BU111",
            "specific_mentions": 2,
            "bird_score": 7.0,
            "threads": [
                {
                    "title": "Shared post",
                    "url": "https://example.test/shared",
                    "created": "2025-01-01T00:00:00Z",
                    "score": 0,
                    "evidence_score": 2.0,
                },
                {
                    "title": "New post",
                    "url": "https://example.test/new",
                    "created": "2026-09-01T00:00:00Z",
                    "evidence_score": 7.0,
                },
            ],
        }

        merged = merge_with_existing_details(existing, refreshed)

        self.assertEqual(merged["specific_mentions"], 3)
        self.assertEqual({thread["url"] for thread in merged["threads"]}, {
            "https://example.test/old",
            "https://example.test/shared",
            "https://example.test/new",
        })
        shared = next(thread for thread in merged["threads"] if thread["url"].endswith("shared"))
        self.assertEqual(shared["score"], 12)


if __name__ == "__main__":
    unittest.main()
