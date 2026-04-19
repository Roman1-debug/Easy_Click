import re


ROLE_EXPANSIONS: dict[str, list[str]] = {
    "soc analyst": ["SOC Analyst", "Security Operations Center Analyst", "Cyber Security Analyst", "Blue Team Analyst", "Security Analyst"],
    "software engineer": ["Software Engineer", "Software Developer", "Backend Developer", "Full Stack Developer", "SDE"],
    "data scientist": ["Data Scientist", "ML Engineer", "Machine Learning Engineer", "Data Analyst"],
    "frontend developer": ["Frontend Developer", "React Developer", "UI Developer", "Web Developer", "Frontend Engineer"],
    "backend developer": ["Backend Developer", "API Developer", "Node.js Developer", "Python Developer", "Backend Engineer"],
    "devops engineer": ["DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer", "Infrastructure Engineer", "Platform Engineer"],
    "product manager": ["Product Manager", "Product Owner", "Business Analyst", "Associate Product Manager"],
    "ui ux designer": ["UI/UX Designer", "UX Designer", "Product Designer", "User Experience Designer", "Interaction Designer"],
    "cybersecurity": ["Cybersecurity Engineer", "Information Security Analyst", "Security Engineer", "Penetration Tester", "AppSec Engineer"],
    "network engineer": ["Network Engineer", "Network Administrator", "Systems Administrator", "Infrastructure Engineer"],
    "data engineer": ["Data Engineer", "ETL Developer", "Big Data Engineer", "Database Developer"],
    "cloud engineer": ["Cloud Engineer", "AWS Engineer", "Azure Engineer", "GCP Engineer", "Cloud Architect"],
    "android developer": ["Android Developer", "Mobile Developer", "Kotlin Developer", "Java Developer"],
    "ios developer": ["iOS Developer", "Swift Developer", "Mobile Developer"],
    "full stack developer": ["Full Stack Developer", "Full Stack Engineer", "Fullstack Developer", "MERN Stack Developer"],
}


def expand_role(role: str) -> list[str]:
    normalized = role.lower().strip()
    for key, expansions in ROLE_EXPANSIONS.items():
        if key in normalized or normalized in key:
            return expansions
    return [role]


def expand_location(location: str) -> list[str]:
    """
    Expands common locations and adds "Remote".
    Note: For a production-ready system, a full geo-dataset is recommended.
    """
    normalized = location.strip().capitalize()
    expansions = [normalized]

    # Common Indian city mappings
    city_aliases = {
        "Mumbai": ["Mumbai", "Navi Mumbai", "Thane"],
        "Bangalore": ["Bangalore", "Bengaluru"],
        "Delhi": ["Delhi", "New Delhi", "Gurgaon", "Noida", "NCR"],
        "Pune": ["Pune", "Pimpri-Chinchwad"],
        "Hyderabad": ["Hyderabad", "Secunderabad"],
    }

    for city, aliases in city_aliases.items():
        if normalized.lower() in [a.lower() for a in aliases]:
            # Add other related locations from the same region
            expansions.extend([a for a in aliases if a.lower() != normalized.lower()])
            break

    expansions.append("Remote")
    return list(dict.fromkeys(expansions)) # Deduplicate while preserving order
