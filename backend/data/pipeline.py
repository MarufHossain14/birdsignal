import os
import argparse
from fetch_reddit_data import fetch_bird_course_threads
from sentiment_analyzer import SentimentAnalyzer
from course_details_analyzer import analyze_course_specific_threads
import json


def parse_course_codes(raw_value):
    """Parse comma/space-separated course codes into uppercase unique list."""
    if not raw_value:
        return []
    tokens = raw_value.replace(",", " ").split()
    unique = []
    seen = set()
    for token in tokens:
        code = token.strip().upper()
        if not code or code in seen:
            continue
        seen.add(code)
        unique.append(code)
    return unique


def load_curated_catalog_codes() -> list[str]:
    """Load curated catalog codes from the frontend's normalized catalog."""
    pipeline_dir = os.path.dirname(__file__)
    catalog_path = os.path.abspath(
        os.path.join(
            pipeline_dir,
            "..",
            "..",
            "frontend",
            "public",
            "data",
            "course-catalog",
            "normalized.json",
        )
    )

    try:
        with open(catalog_path, "r") as f:
            catalog = json.load(f)
    except Exception as e:
        print(f"Warning: failed to load curated catalog from {catalog_path}: {e}")
        return []

    codes = []
    seen = set()
    for row in catalog:
        code = str(row.get("code", "")).strip().upper()
        if not code or code in seen:
            continue
        seen.add(code)
        codes.append(code)
    return codes


def build_detailed_analysis_targets(top_courses, curated_catalog_codes, must_include_courses):
    """Combine discovery and curated-coverage targets into one deduplicated list."""
    requested_must_include = [code.upper() for code in (must_include_courses or [])]
    seen = set()
    ordered_targets = []

    for code in list(top_courses) + list(curated_catalog_codes) + requested_must_include:
        normalized = str(code).strip().upper()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered_targets.append(normalized)

    return ordered_targets, requested_must_include

def save_to_json(data, file_path):
    """Save data to a JSON file"""
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Data saved to {file_path}")
    except Exception as e:
        print(f"Error saving data to {file_path}: {e}")

def run_pipeline(
    api_url,
    limit,
    time_period,
    data_dir,
    processed_dir,
    analyze_top_courses=True,
    top_courses_count=10,
    must_include_courses=None,
    course_thread_limit=25,
):
    """Run the full data pipeline"""
    # Ensure directories exist
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(processed_dir, exist_ok=True)
    
    # Create a directory for course details
    course_details_dir = os.path.join(processed_dir, "course_details")
    os.makedirs(course_details_dir, exist_ok=True)
    
    # 1. Fetch data from Reddit API
    print(f"Fetching up to {limit} bird course threads from the past {time_period}...")
    threads = fetch_bird_course_threads(api_url, limit, time_period)
    
    if not threads:
        print("No threads fetched. Make sure the Reddit API server is running.")
        print(f"Check that the API server is running at {api_url}")
        return
    
    # 2. Save raw data to a single file
    raw_data_file = os.path.join(data_dir, "latest_raw_threads.json")
    save_to_json(threads, raw_data_file)
    
    # 3. Initialize sentiment analyzer
    analyzer = SentimentAnalyzer()
    
    # 4. Analyze threads
    print(f"Analyzing {len(threads)} threads...")
    analyzed_threads = analyzer.analyze_threads(threads)
    
    # 5. Save analyzed threads to a single file
    save_to_json(analyzed_threads, os.path.join(data_dir, "latest_threads.json"))
    
    # 6. Generate course rankings
    print("Generating course rankings...")
    course_rankings = analyzer.get_course_rankings(analyzed_threads)
    
    # 7. Normalize bird scores to ensure they're on a 0-10 scale
    for course in course_rankings:
        course['bird_score'] = min(10.0, course.get('bird_score', 0))
        course['bird_score'] = round(course['bird_score'] * 100) / 100
    
    # 8. If enabled, analyze top courses in more detail
    if analyze_top_courses and course_rankings:
        print(f"\nAnalyzing top {top_courses_count} courses in detail...")

        top_courses = [course['code'] for course in course_rankings[:top_courses_count]]
        curated_catalog_codes = load_curated_catalog_codes()
        courses_for_detailed_analysis, requested_must_include = build_detailed_analysis_targets(
            top_courses,
            curated_catalog_codes,
            must_include_courses,
        )

        print(
            "Courses selected for detailed analysis: "
            f"{', '.join(courses_for_detailed_analysis)}"
        )
        print(
            "Selection breakdown: "
            f"{len(top_courses)} discovered bird-course targets + "
            f"{len(curated_catalog_codes)} curated catalog targets"
        )
        if requested_must_include:
            print(
                "Must-include courses requested: "
                f"{', '.join(requested_must_include)}"
            )
        print(f"Per-course thread limit: {course_thread_limit}")

        # Run detailed analysis
        course_details = analyze_course_specific_threads(
            api_url,
            courses_for_detailed_analysis,
            course_details_dir,
            course_thread_limit,
        )
        
        print(f"Detailed analysis completed for {len(course_details)} courses.")
        save_to_json(course_details, os.path.join(processed_dir, "latest_course_details.json"))
    
    # 9. Print summary
    print(f"\nPipeline completed successfully.")
    print(f"Processed {len(threads)} threads and identified {len(course_rankings)} courses")
    
    # Sort the course rankings by bird_score before displaying
    sorted_rankings = sorted(course_rankings, key=lambda x: x['bird_score'], reverse=True)
    
    print(f"\nTop 5 bird courses:")
    for i, course in enumerate(sorted_rankings[:5], 1):
        print(f"{i}. {course['code']} - Bird Score: {course['bird_score']:.2f}/10 - Mentions: {course['mentions']}")

def main():
    parser = argparse.ArgumentParser(description='Run the BirdSignal data pipeline')
    parser.add_argument('--api-url', default='http://localhost:3001', help='URL of the Reddit API service')
    parser.add_argument('--limit', type=int, default=200, help='Maximum number of threads to fetch')
    parser.add_argument('--time-period', choices=['hour', 'day', 'week', 'month', 'year', 'all'], 
                        default='all', help='Time period to search')
    parser.add_argument('--data-dir', default='data', help='Directory to save raw data')
    parser.add_argument('--processed-dir', default='processed', help='Directory to save processed data')
    parser.add_argument('--analyze-top-courses', action='store_true',
                        help='Enable detailed analysis of top courses')
    parser.add_argument('--skip-top-courses', action='store_true',
                        help='Skip detailed analysis of top courses')
    parser.add_argument('--top-courses-count', type=int, default=15, 
                        help='Number of top courses to analyze in detail')
    parser.add_argument(
        '--must-include-courses',
        default='',
        help='Comma/space-separated course codes to always include in detailed analysis',
    )
    parser.add_argument(
        '--course-thread-limit',
        type=int,
        default=25,
        help='Maximum number of threads fetched per course for detailed analysis',
    )
    parser.add_argument('--no-prompt', action='store_true', 
                        help='Run without prompting for time period')
    
    args = parser.parse_args()
    
    # Prompt for time period if not using --no-prompt
    if not args.no_prompt:
        print("Select time period for Reddit posts:")
        print("1. hour  - Posts from the last hour")
        print("2. day   - Posts from the last day")
        print("3. week  - Posts from the last week")
        print("4. month - Posts from the last month")
        print("5. year  - Posts from the last year")
        print("6. all   - All posts regardless of time")
        
        time_options = {
            '1': 'hour',
            '2': 'day',
            '3': 'week',
            '4': 'month',
            '5': 'year',
            '6': 'all'
        }
        
        while True:
            choice = input("Enter your choice (1-6) [default=5]: ").strip() or '5'
            if choice in time_options:
                args.time_period = time_options[choice]
                break
            print("Invalid choice. Please enter a number between 1 and 6.")
    
    analyze_top_courses = True
    if args.skip_top_courses:
        analyze_top_courses = False
    elif args.analyze_top_courses:
        analyze_top_courses = True

    run_pipeline(
        args.api_url, 
        args.limit, 
        args.time_period, 
        args.data_dir, 
        args.processed_dir,
        analyze_top_courses,
        args.top_courses_count,
        parse_course_codes(args.must_include_courses),
        args.course_thread_limit,
    )

if __name__ == "__main__":
    main()
