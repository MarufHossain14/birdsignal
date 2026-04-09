import os
import sys
import json
import argparse
import datetime
import math
import requests
import re
from typing import List, Dict, Any
from collections import Counter
from sentiment_analyzer import SentimentAnalyzer

def fetch_course_specific_threads(api_url: str, course_code: str, limit: int = 25) -> List[Dict[str, Any]]:
    """Fetch threads that specifically mention a course code in the title"""
    try:
        endpoint = f"{api_url}/api/course-threads/{course_code}"
        response = requests.get(endpoint, params={"limit": limit})
        response.raise_for_status()  # Raise exception for HTTP errors
        threads = response.json()
        print(f"Fetched {len(threads)} threads specifically about {course_code}")
        return threads
    except requests.exceptions.RequestException as e:
        print(f"Error fetching course-specific threads for {course_code}: {e}")
        return []

def extract_key_course_attributes(
    threads: List[Dict[str, Any]],
    analyzer: SentimentAnalyzer = None,
    requested_course_code: str | None = None,
) -> Dict[str, Any]:
    """Extract key course attributes from threads that specifically mention a course"""
    if not threads:
        return {}
    
    # If analyzer is not provided, initialize one
    if analyzer is None:
        analyzer = SentimentAnalyzer()
    
    requested_course_code = (requested_course_code or "").upper().strip()

    # Infer the course code from thread content when possible, but allow the caller
    # to pin the requested course so body-only matches are not discarded.
    course_pattern = re.compile(r'\b[A-Z]{2,5}[0-9]{2,4}[A-Z]?\b')
    course_codes = []
    for thread in threads:
        combined_text = f"{thread.get('title', '')} {thread.get('selftext', '')}"
        matches = [match.upper() for match in course_pattern.findall(combined_text)]
        if requested_course_code:
            matches = [match for match in matches if match == requested_course_code]
        course_codes.extend(matches)

    if requested_course_code:
        course_code = requested_course_code
    elif course_codes:
        course_code = Counter(course_codes).most_common(1)[0][0]
    else:
        return {}
    
    # Initialize course attributes with more detailed information
    course_attributes = {
        "code": course_code,
        "department": course_code[:2],
        "specific_mentions": len(threads),
        "avg_thread_score": 0,
        "recent_mentions": 0,
        "oldest_thread_date": None,
        "newest_thread_date": None,
        "is_online_available": False,
        "bird_score": 0,
        "discussion_topics": {
            "difficulty": 0,
            "workload": 0,
            "bird_course": 0,
            "content": 0,
            "structure": 0,
            "grading": 0
        },
        "course_components": {
            "exams": {
                "midterm": 0,
                "final": 0,
                "total": 0,
                "weight_mentioned": False,
                "difficulty_mentioned": False
            },
            "assignments": {
                "count": 0,
                "papers": 0,
                "total": 0,
                "weight_mentioned": False,
                "difficulty_mentioned": False
            },
            "assessments": {
                "quizzes": 0,
                "labs": 0,
                "attendance": 0,
                "participation": 0,
                "presentations": 0,
                "projects": 0,
                "group_work": 0
            }
        },
        "sentiment_analysis": {
            "positive_aspects": {},
            "negative_aspects": {},
            "overall_sentiment": 0,
            "compound": 0,
            "pos": 0,
            "neu": 0,
            "neg": 0,
            "bird_terms": {}
        },
        "context_clues": {
            "terms": {},
            "year_level_appropriate": True,
            "pre_requisites_mentioned": False
        },
        "thread_summary": {
            "post_dates": [],
            "scores": [],
            "comments": [],
            "titles": []
        },
        "threads": threads
    }
    
    # Patterns for detecting course aspects
    online_pattern = re.compile(r'\b(?:online|OC|distance|remote)\b', re.IGNORECASE)
    
    # Common discussion topics for courses
    topic_patterns = {
        "difficulty": re.compile(r'\b(?:difficult|hard|easy|tough|straightforward|challenging|simple|doable)\b', re.IGNORECASE),
        "workload": re.compile(r'\b(?:workload|lot of work|little work|time-consuming|minimal work|effort|hours|weekly)\b', re.IGNORECASE),
        "bird_course": re.compile(r'\b(?:bird course|bird|gpa booster|grade booster|easy course|easy 12|easy A|easy mark)\b', re.IGNORECASE),
        "content": re.compile(r'\b(?:content|material|lectures|readings|textbook|interesting|boring|enjoyable|concepts)\b', re.IGNORECASE),
        "structure": re.compile(r'\b(?:structure|organized|format|syllabus|outline|schedule|weekly|lecture|teaching style)\b', re.IGNORECASE),
        "grading": re.compile(r'\b(?:grading|grades|marking|curve|bell curve|scaled|fair|harsh|lenient|easy grader|tough grader)\b', re.IGNORECASE),
        
        # Course components
        "midterm": re.compile(r'\b(?:midterm|midterms|mid-term|mid term)\b', re.IGNORECASE),
        "final": re.compile(r'\b(?:final|finals|final exam|exam)\b', re.IGNORECASE),
        "assignment": re.compile(r'\b(?:assignment|assignments|homework)\b', re.IGNORECASE),
        "paper": re.compile(r'\b(?:paper|papers|essay|essays|report|reports|writing)\b', re.IGNORECASE),
        "quiz": re.compile(r'\b(?:quiz|quizzes|test|tests)\b', re.IGNORECASE),
        "lab": re.compile(r'\b(?:lab|labs|laboratory|practical)\b', re.IGNORECASE),
        "attendance": re.compile(r'\b(?:attendance|attend|attending|show up|present)\b', re.IGNORECASE),
        "participation": re.compile(r'\b(?:participation|participate|class discussion|discussion|contributing)\b', re.IGNORECASE),
        "presentation": re.compile(r'\b(?:presentation|presentations|present|presenting|slides)\b', re.IGNORECASE),
        "project": re.compile(r'\b(?:project|projects|assignment|term project)\b', re.IGNORECASE),
        "group": re.compile(r'\b(?:group|team|partner|group work|group project|group assignment)\b', re.IGNORECASE),
        
        # Positive terms
        "fair": re.compile(r'\b(?:fair|reasonable|manageable|balanced)\b', re.IGNORECASE),
        "interesting": re.compile(r'\b(?:interesting|engaging|fascinating|enjoyed|enjoyable|fun)\b', re.IGNORECASE),
        "helpful": re.compile(r'\b(?:helpful|useful|practical|valuable|worth it|worth taking)\b', re.IGNORECASE),
        "organized": re.compile(r'\b(?:organized|well-structured|clear|straightforward|well planned)\b', re.IGNORECASE),
        
        # Negative terms
        "boring": re.compile(r'\b(?:boring|dull|dry|tedious|monotonous|not interesting)\b', re.IGNORECASE),
        "useless": re.compile(r'\b(?:useless|pointless|waste|not worth|worthless)\b', re.IGNORECASE),
        "confusing": re.compile(r'\b(?:confusing|unclear|disorganized|messy|all over the place|no structure)\b', re.IGNORECASE),
        "stressful": re.compile(r'\b(?:stressful|stress|anxiety|overwhelming|too much|excessive)\b', re.IGNORECASE),
        
        # Course assessment terms
        "curved": re.compile(r'\b(?:curve|curved|bell curve|scaled|adjusting grades|adjusted)\b', re.IGNORECASE),
        "weight": re.compile(r'\b(?:weight|worth|percentage|percent|\d+%|portion|counts for)\b', re.IGNORECASE),
        "prerequisite": re.compile(r'\b(?:prerequisite|prereq|required|requirement|needed for|need to take|before taking)\b', re.IGNORECASE)
    }
    
    # Track total values to calculate average
    total_score = 0
    total_comments = 0
    post_dates = []
    recent_cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=365)  # Threads from the last year
    
    # Process each thread to extract information
    for thread in threads:
        # Combine title and selftext for analysis
        full_text = f"{thread.get('title', '')} {thread.get('selftext', '')}"
        
        # Store thread data for summary
        course_attributes["thread_summary"]["titles"].append(thread.get('title', ''))
        course_attributes["thread_summary"]["scores"].append(thread.get('score', 0))
        total_score += thread.get('score', 0)
        
        # Parse comment counts
        if 'num_comments' in thread:
            course_attributes["thread_summary"]["comments"].append(thread['num_comments'])
            total_comments += thread['num_comments']
        
        # Parse dates
        if 'created' in thread:
            try:
                thread_date = datetime.datetime.fromisoformat(thread['created'].replace('Z', '+00:00'))
                post_dates.append(thread_date)
                course_attributes["thread_summary"]["post_dates"].append(thread_date.isoformat())
                
                # Check if this is a recent thread
                if thread_date > recent_cutoff:
                    course_attributes["recent_mentions"] += 1
            except (ValueError, TypeError):
                pass
        
        # Check for online/OC mentions
        if online_pattern.search(full_text):
            course_attributes["is_online_available"] = True
        
        # Check for topic mentions
        for topic in ["difficulty", "workload", "bird_course", "content", "structure", "grading"]:
            if topic_patterns[topic].search(full_text):
                course_attributes["discussion_topics"][topic] += 1
        
        # Check for course components
        # Exams
        if topic_patterns["midterm"].search(full_text):
            course_attributes["course_components"]["exams"]["midterm"] += 1
            course_attributes["course_components"]["exams"]["total"] += 1
        if topic_patterns["final"].search(full_text):
            course_attributes["course_components"]["exams"]["final"] += 1
            course_attributes["course_components"]["exams"]["total"] += 1
        
        # Assignments
        if topic_patterns["assignment"].search(full_text):
            course_attributes["course_components"]["assignments"]["count"] += 1
            course_attributes["course_components"]["assignments"]["total"] += 1
        if topic_patterns["paper"].search(full_text):
            course_attributes["course_components"]["assignments"]["papers"] += 1
            course_attributes["course_components"]["assignments"]["total"] += 1
        
        # Other assessments
        for assessment in ["quiz", "lab", "attendance", "participation", "presentation", "project", "group"]:
            if topic_patterns[assessment].search(full_text):
                # Fix for special pluralization cases
                if assessment == "quiz":
                    key = "quizzes"
                elif assessment == "group":
                    key = "group_work"
                elif assessment == "participation":
                    key = "participation"  # participation doesn't need to be pluralized
                elif assessment == "attendance":
                    key = "attendance"  # attendance doesn't need to be pluralized
                else:
                    key = assessment + "s"
                course_attributes["course_components"]["assessments"][key] += 1
        
        # Check for weight and difficulty mentions for assignments and exams
        if topic_patterns["weight"].search(full_text):
            if topic_patterns["midterm"].search(full_text) or topic_patterns["final"].search(full_text):
                course_attributes["course_components"]["exams"]["weight_mentioned"] = True
            if topic_patterns["assignment"].search(full_text) or topic_patterns["paper"].search(full_text):
                course_attributes["course_components"]["assignments"]["weight_mentioned"] = True
        
        if topic_patterns["difficulty"].search(full_text):
            if topic_patterns["midterm"].search(full_text) or topic_patterns["final"].search(full_text):
                course_attributes["course_components"]["exams"]["difficulty_mentioned"] = True
            if topic_patterns["assignment"].search(full_text) or topic_patterns["paper"].search(full_text):
                course_attributes["course_components"]["assignments"]["difficulty_mentioned"] = True
        
        # Check for prerequisite mentions
        if topic_patterns["prerequisite"].search(full_text):
            course_attributes["context_clues"]["pre_requisites_mentioned"] = True
        
        # Extract positive and negative aspects
        for term in ["fair", "interesting", "helpful", "organized"]:
            if topic_patterns[term].search(full_text):
                course_attributes["sentiment_analysis"]["positive_aspects"][term] = \
                    course_attributes["sentiment_analysis"]["positive_aspects"].get(term, 0) + 1
        
        for term in ["boring", "useless", "confusing", "stressful"]:
            if topic_patterns[term].search(full_text):
                course_attributes["sentiment_analysis"]["negative_aspects"][term] = \
                    course_attributes["sentiment_analysis"]["negative_aspects"].get(term, 0) + 1
    
    # Calculate date range of discussions
    if post_dates:
        course_attributes["oldest_thread_date"] = min(post_dates).isoformat()
        course_attributes["newest_thread_date"] = max(post_dates).isoformat()
    
    # Calculate average score per thread
    if threads:
        course_attributes["avg_thread_score"] = total_score / len(threads)
    
    # Check if year level is appropriate (300+ level courses should have upper-year discussions)
    try:
        numeric_part = re.search(r'\d+', course_code)
        if numeric_part:
            course_number = int(numeric_part.group())
            if course_number >= 300 and course_attributes["discussion_topics"]["difficulty"] < 2:
                course_attributes["context_clues"]["year_level_appropriate"] = False
    except (ValueError, TypeError):
        pass
    
    # Calculate overall sentiment
    # Positive factors: bird course mentions, positive aspects
    # Negative factors: negative aspects, difficulty mentions
    positive_sentiment = (
        course_attributes["discussion_topics"]["bird_course"] * 2 +
        sum(course_attributes["sentiment_analysis"]["positive_aspects"].values())
    )
    
    negative_sentiment = (
        sum(course_attributes["sentiment_analysis"]["negative_aspects"].values()) * 1.5 +
        (course_attributes["discussion_topics"]["difficulty"] if 
         course_attributes["discussion_topics"]["difficulty"] >= 3 else 0)
    )
    
    # Calculate overall sentiment (-10 to 10 scale)
    if threads:
        denominator = max(1, len(threads))
        sentiment_raw = (positive_sentiment - negative_sentiment) / denominator * 5
        course_attributes["sentiment_analysis"]["overall_sentiment"] = max(-10, min(10, sentiment_raw))
        
        # Calculate sentiment scores for bird score calculation
        total_compound = 0
        total_pos = 0
        total_neg = 0
        total_neu = 0
        total_bird_terms = {}
        total_comments = 0
        
        # Process each thread for sentiment analysis
        for thread in threads:
            full_text = f"{thread['title']} {thread['selftext']}"
            
            # Get sentiment scores using the analyzer
            sentiment = analyzer.sia.polarity_scores(full_text)
            
            # Collect bird terms
            thread_bird_terms = analyzer.detect_bird_terms_dict(full_text)
            for term, count in thread_bird_terms.items():
                if term in total_bird_terms:
                    total_bird_terms[term] += count
                else:
                    total_bird_terms[term] = count
            
            # Collect sentiment scores
            total_compound += sentiment["compound"]
            total_pos += sentiment["pos"]
            total_neg += sentiment["neg"]
            total_neu += sentiment["neu"]
            total_comments += thread.get("num_comments", 0)
        
        # Calculate averages
        avg_compound = total_compound / len(threads)
        avg_pos = total_pos / len(threads)
        avg_neg = total_neg / len(threads)
        avg_neu = total_neu / len(threads)
        avg_comments = total_comments / len(threads) if threads else 0
        
        # Store in course attributes
        course_attributes["sentiment_analysis"]["compound"] = avg_compound
        course_attributes["sentiment_analysis"]["pos"] = avg_pos
        course_attributes["sentiment_analysis"]["neg"] = avg_neg
        course_attributes["sentiment_analysis"]["neu"] = avg_neu
        course_attributes["sentiment_analysis"]["bird_terms"] = total_bird_terms
    
    # Identify key terms by frequency
    all_text = " ".join([f"{t['title']} {t['selftext']}" for t in threads]).lower()
    common_words = re.findall(r'\b[a-z]{4,}\b', all_text)
    
    # Filter out very common words
    stop_words = {"about", "after", "again", "also", "because", "before", "being", "between", 
                  "both", "course", "could", "does", "doing", "during", "each", "even", 
                  "every", "from", "have", "having", "here", "just", "like", "more", "most", 
                  "much", "need", "only", "other", "really", "some", "such", "take", "takes", 
                  "taking", "than", "that", "their", "them", "then", "there", "these", "they", 
                  "this", "through", "very", "what", "when", "where", "which", "while", "will", 
                  "with", "would", "your"}
    
    # Count term frequency
    term_counts = Counter([w for w in common_words if w not in stop_words])
    # Get most common terms (up to 10)
    course_attributes["context_clues"]["terms"] = {term: count for term, count in term_counts.most_common(10)}
    
    # Calculate bird score similar to sentiment_analyzer.py get_course_rankings method
    # Calculate bird term score
    bird_term_score = 0
    for term, count in course_attributes["sentiment_analysis"]["bird_terms"].items():
        if term.startswith("anti:"):
            # This is an anti-bird term
            actual_term = term[5:]  # Remove "anti:" prefix
            bird_term_score += analyzer.anti_bird_terms.get(actual_term, 0) * count
        else:
            bird_term_score += analyzer.bird_terms.get(term, 0) * count
    
    # Normalize bird term score based on mentions
    if len(threads) > 0:
        bird_term_score /= len(threads)
    
    # Calculate title mention bonus - course code appears in title
    title_mentions = sum(1 for thread in threads if course_code in thread.get("title", ""))
    title_bonus = title_mentions * 0.3
    
    # Get department adjustment
    dept_code = course_attributes["department"]
    dept_adjustment = analyzer.department_adjustments.get(dept_code, 0)
    
    # Comment factor (negative for high comment counts)
    comment_factor = min(0.5, max(-0.5, (avg_comments - 10) / -20))
    
    # Extract course number for level adjustment
    course_number = 0
    try:
        numeric_part = re.search(r'\d+', course_code)
        if numeric_part:
            course_number = int(numeric_part.group())
    except (ValueError, AttributeError):
        pass
    
    # Higher course numbers generally indicate more advanced, potentially harder courses
    level_adjustment = 0
    if course_number >= 300:
        level_adjustment = -0.5  # Harder senior-level courses
    elif course_number >= 200:
        level_adjustment = -0.3  # Moderately harder intermediate courses
    elif course_number >= 100:
        level_adjustment = 0     # No adjustment for first-year courses
    
    # Calculate bird score with all factors - improved algorithm
    total_score = sum(thread.get("score", 0) for thread in threads)
    avg_score = total_score / len(threads) if threads else 0
    
    # NEW: Additional penalty factors for courses with many mentions of difficult components
    assessment_penalty = 0
    
    # Extract mentions of exams, assignments, etc.
    exam_mentions = course_attributes["course_components"]["exams"]["total"]
    midterm_mentions = course_attributes["course_components"]["exams"]["midterm"]
    final_mentions = course_attributes["course_components"]["exams"]["final"]
    
    # Calculate assessment penalty based on mentions and difficulty
    if course_attributes["course_components"]["exams"]["difficulty_mentioned"]:
        # If difficulty of exams is explicitly mentioned, increase penalty
        assessment_penalty -= (midterm_mentions + final_mentions) * 0.15
    else:
        # Otherwise, still apply a smaller penalty for having many exams/midterms
        assessment_penalty -= (midterm_mentions + final_mentions) * 0.05
    
    # NEW: Apply penalty for high mentions of difficulty in discussion
    difficulty_mentions = course_attributes["discussion_topics"]["difficulty"]
    workload_mentions = course_attributes["discussion_topics"]["workload"]
    bird_course_mentions = course_attributes["discussion_topics"]["bird_course"]

    positive_difficulty_terms = course_attributes["sentiment_analysis"]["bird_terms"].get('easy', 0)
    positive_difficulty_terms += course_attributes["sentiment_analysis"]["bird_terms"].get('simple', 0)
    positive_difficulty_terms += course_attributes["sentiment_analysis"]["bird_terms"].get('straightforward', 0)
    positive_difficulty_terms += course_attributes["sentiment_analysis"]["bird_terms"].get('doable', 0)
    negative_difficulty_terms = (
        course_attributes["sentiment_analysis"]["bird_terms"].get('anti:hard', 0) +
        course_attributes["sentiment_analysis"]["bird_terms"].get('anti:difficult', 0) +
        course_attributes["sentiment_analysis"]["bird_terms"].get('anti:tough', 0) +
        course_attributes["sentiment_analysis"]["bird_terms"].get('anti:challenging', 0)
    )
    net_difficulty_penalty = max(0, difficulty_mentions + negative_difficulty_terms - positive_difficulty_terms)

    # Bird-course mentions should help, workload should hurt, and "easy" wording
    # should offset generic difficulty-topic matches rather than being punished.
    topic_adjustment = (bird_course_mentions * 0.4) - (net_difficulty_penalty * 0.25) - (workload_mentions * 0.15)
    
    # NEW: Check if failure is commonly mentioned
    failure_mentions = sum(count for term, count in course_attributes["sentiment_analysis"]["bird_terms"].items() 
                          if "fail" in term or "failed" in term or "failing" in term)
    failure_penalty = -0.4 * failure_mentions / max(1, len(threads))
    
    # NEW: Analyze sentiment patterns in titles more carefully
    negative_title_sentiment = 0
    for thread in threads:
        if "title" in thread and course_code in thread["title"]:
            title_lower = thread["title"].lower()
            if any(term in title_lower for term in ["fail", "hard", "difficult", "tough", "help", "struggling"]):
                negative_title_sentiment -= 0.2
    
    # Calculate final bird score with improved factors
    course_attributes["bird_score"] = (
        (course_attributes["sentiment_analysis"]["compound"] * 2.0) +       # Reduced weight of compound sentiment
        (min(1.2, course_attributes["specific_mentions"] / 5)) +           # Mentions factor
        (course_attributes["sentiment_analysis"]["pos"] * 1.5) -           # Positive sentiment
        (course_attributes["sentiment_analysis"]["neg"] * 4.0) +           # Increased weight of negative sentiment
        (bird_term_score * 1.0) +                                          # Reduced weight of bird terms
        (min(0.6, avg_score / 50)) +                                       # Reddit score
        title_bonus +                                                      # Title mentions
        dept_adjustment +                                                  # Department adjustment
        comment_factor +                                                   # Comment factor
        level_adjustment +                                                 # Course level adjustment
        topic_adjustment +                                                 # NEW: Topic-based adjustment
        assessment_penalty +                                               # NEW: Assessment penalty
        failure_penalty +                                                  # NEW: Failure mentions penalty
        negative_title_sentiment                                           # NEW: Title sentiment penalty
    )
    
    # Store additional scores for reference
    course_attributes["bird_term_score"] = bird_term_score
    course_attributes["dept_adjustment"] = dept_adjustment
    course_attributes["comment_factor"] = comment_factor
    course_attributes["level_adjustment"] = level_adjustment
    course_attributes["topic_adjustment"] = topic_adjustment               # NEW: Store topic adjustment
    course_attributes["assessment_penalty"] = assessment_penalty           # NEW: Store assessment penalty
    course_attributes["failure_penalty"] = failure_penalty                 # NEW: Store failure penalty
    
    # Ensure bird score is in a reasonable range (0-10)
    course_attributes["bird_score"] = max(0, min(10, course_attributes["bird_score"]))

    return course_attributes

def analyze_course_specific_threads(api_url: str, course_codes: List[str], output_dir: str, limit: int = 25) -> List[Dict[str, Any]]:
    """Analyze threads specific to a list of course codes"""
    os.makedirs(output_dir, exist_ok=True)

    # Remove stale generated JSON so index/catalog and per-course files stay in sync.
    for name in os.listdir(output_dir):
        if not name.endswith(".json"):
            continue
        full_path = os.path.join(output_dir, name)
        if os.path.isfile(full_path):
            os.remove(full_path)
    
    # Initialize sentiment analyzer
    analyzer = SentimentAnalyzer()
    
    all_course_details = []
    successful_course_codes = []  # Track successfully analyzed courses
    
    for course_code in course_codes:
        requested_code = course_code.upper()
        print(f"Analyzing threads specifically for {course_code}...")
        
        # Fetch threads specifically about this course
        threads = fetch_course_specific_threads(api_url, course_code, limit)
        
        if not threads:
            print(f"No specific threads found for {course_code}, skipping...")
            continue
        
        # Analyze sentiment of threads
        analyzed_threads = analyzer.analyze_threads(threads)
        
        # Extract key course attributes
        course_details = extract_key_course_attributes(
            analyzed_threads,
            analyzer,
            requested_course_code=requested_code,
        )

        if course_details:
            # Preserve the requested course identity even when thread text mentions nearby course codes.
            dept_match = re.match(r"[A-Z]{2,5}", requested_code)
            course_details["code"] = requested_code
            course_details["department"] = dept_match.group(0) if dept_match else requested_code[:2]

            # Ensure bird score is properly capped at 10.0
            course_details['bird_score'] = min(10.0, course_details.get('bird_score', 0))
            course_details['bird_score'] = round(course_details['bird_score'] * 100) / 100

            oldest_date = course_details.get("oldest_thread_date")
            newest_date = course_details.get("newest_thread_date")
            recent_mentions = int(course_details.get("recent_mentions", 0))
            specific_mentions = int(course_details.get("specific_mentions", 0))
            if specific_mentions < 8:
                sample_bias_warning = "Low sample size. Treat this score as directional only."
            elif specific_mentions > 0 and (recent_mentions / specific_mentions) < 0.35:
                sample_bias_warning = "Most evidence is older. Course experience may have changed."
            else:
                sample_bias_warning = "Signals are reasonably representative."

            positive_aspects = course_details["sentiment_analysis"].get("positive_aspects", {})
            negative_aspects = course_details["sentiment_analysis"].get("negative_aspects", {})

            def aspect_score(pos_terms: List[str], neg_terms: List[str]) -> int:
                pos = sum(positive_aspects.get(term, 0) for term in pos_terms)
                neg = sum(negative_aspects.get(term, 0) for term in neg_terms)
                total = pos + neg
                if total == 0:
                    return 0
                return round(((pos - neg) / total) * 100)

            aspect_sentiment = {
                "difficulty": {
                    "label": "Difficulty",
                    "score": aspect_score(["fair", "organized"], ["stressful", "confusing"]),
                },
                "grading": {
                    "label": "Grading",
                    "score": aspect_score(["fair"], ["stressful"]),
                },
                "workload": {
                    "label": "Workload",
                    "score": max(-100, min(100, round((3 - course_details["discussion_topics"].get("workload", 0)) * 20))),
                },
                "professor": {
                    "label": "Professor",
                    "score": aspect_score(["helpful", "organized"], ["confusing", "useless"]),
                },
            }

            easy_mentions = course_details['sentiment_analysis']['bird_terms'].get('easy', 0)
            hard_mentions = (
                course_details['sentiment_analysis']['bird_terms'].get('anti:hard', 0) +
                course_details['sentiment_analysis']['bird_terms'].get('anti:difficult', 0)
            )
            finals_signal = course_details['course_components']['exams']['final'] > 0
            midterm_signal = course_details['course_components']['exams']['midterm'] > 0
            workload_signal = course_details['discussion_topics'].get('workload', 0)

            if specific_mentions < 3:
                ai_summary = (
                    f"Very limited evidence ({specific_mentions} mention"
                    f"{'' if specific_mentions == 1 else 's'}). "
                    "Use the thread list directly before relying on this score."
                )
            else:
                if easy_mentions - hard_mentions >= 2:
                    difficulty_note = (
                        f"More posts call it easy than hard ({easy_mentions} vs {hard_mentions})."
                    )
                elif hard_mentions - easy_mentions >= 2:
                    difficulty_note = (
                        f"More posts call it hard than easy ({hard_mentions} vs {easy_mentions})."
                    )
                else:
                    difficulty_note = (
                        f"Mixed difficulty signals ({easy_mentions} easy, {hard_mentions} hard mentions)."
                    )

                workload_note = (
                    "light workload signals"
                    if workload_signal <= 3
                    else "moderate workload signals"
                    if workload_signal <= 7
                    else "heavy workload signals"
                )
                exams_note = (
                    f"Finals: {'mentioned' if finals_signal else 'not clearly mentioned'}; "
                    f"midterms: {'mentioned' if midterm_signal else 'not clearly mentioned'}."
                )
                ai_summary = (
                    f"{difficulty_note} {workload_note.capitalize()} across {workload_signal} workload references. "
                    f"{exams_note} {sample_bias_warning}"
                )

            now = datetime.datetime.now(datetime.timezone.utc)
            annotated_threads = []
            for t in course_details.get('threads', []):
                created_iso = t.get('created', '')
                try:
                    created_dt = datetime.datetime.fromisoformat(created_iso.replace('Z', '+00:00'))
                except (TypeError, ValueError):
                    created_dt = now - datetime.timedelta(days=365)

                age_days = max(0.0, (now - created_dt).total_seconds() / 86400.0)
                recency = math.exp(-age_days / 365.0)
                upvotes = min(1.0, max(0.0, math.log10(max(1, t.get('score', 0) + 1)) / 2))
                relevance = 1.0 if course_code.lower() in (t.get('title', '').lower() + " " + t.get('selftext', '').lower()) else 0.6
                comments = min(1.0, max(0.0, math.log10(max(1, t.get('num_comments', 0) + 1)) / 2))
                evidence_score = round((upvotes * 0.35 + recency * 0.35 + relevance * 0.2 + comments * 0.1) * 10, 1)

                annotated_threads.append(
                    {
                        "title": t['title'],
                        "url": t['url'],
                        "score": t['score'],
                        "created": created_iso,
                        "num_comments": t.get('num_comments', 0),
                        "evidence_score": evidence_score,
                    }
                )
            annotated_threads.sort(key=lambda item: item.get("evidence_score", 0), reverse=True)
            
            # Create streamlined course details
            streamlined_details = {
                "code": course_details['code'],
                "department": course_details['department'],
                "bird_score": course_details['bird_score'],
                "specific_mentions": course_details['specific_mentions'],
                "is_online_available": course_details.get('is_online_available', False),
                "ai_summary": ai_summary,
                "confidence_signals": {
                    "recent_mentions": recent_mentions,
                    "oldest_thread_date": oldest_date,
                    "newest_thread_date": newest_date,
                    "sample_bias_warning": sample_bias_warning,
                },
                "aspect_sentiment": aspect_sentiment,
                "difficulty_level": {
                    "easy_mentions": easy_mentions,
                    "hard_mentions": hard_mentions,
                    "workload": course_details['discussion_topics'].get('workload', 0)
                },
                "course_structure": {
                    "has_finals": course_details['course_components']['exams']['final'] > 0,
                    "has_midterms": course_details['course_components']['exams']['midterm'] > 0,
                    "has_assignments": course_details['course_components']['assignments']['total'] > 0,
                    "has_projects": course_details['course_components']['assessments'].get('projects', 0) > 0,
                },
                "threads": annotated_threads
            }
            
            all_course_details.append(streamlined_details)
            successful_course_codes.append(requested_code)  # Add to successful courses list
            
            # Save individual course details
            with open(os.path.join(output_dir, f"{requested_code}.json"), 'w') as f:
                json.dump(streamlined_details, f, indent=2)
    
    # Save index.json with all successful course codes
    with open(os.path.join(output_dir, "index.json"), 'w') as f:
        json.dump(sorted(successful_course_codes), f, indent=2)

    # Save aggregated catalog for fast frontend loading.
    with open(os.path.join(output_dir, "catalog.json"), 'w') as f:
        json.dump(
            sorted(all_course_details, key=lambda course: course.get("bird_score", 0), reverse=True),
            f,
            indent=2
        )
    
    return all_course_details

def main():
    parser = argparse.ArgumentParser(description='Analyze course-specific Reddit threads')
    parser.add_argument('--api-url', default='http://localhost:3001', help='URL of the Reddit API service')
    parser.add_argument('--course-codes', required=True, nargs='+', help='List of course codes to analyze')
    parser.add_argument('--limit', type=int, default=25, help='Maximum number of threads to fetch per course')
    parser.add_argument('--output-dir', default='processed/course_details', help='Directory to save course details')
    
    args = parser.parse_args()
    analyze_course_specific_threads(args.api_url, args.course_codes, args.output_dir, args.limit)

if __name__ == "__main__":
    main()
