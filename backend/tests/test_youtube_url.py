"""Unit tests: YouTube video-ID extraction (structural URL parse, ADR-0005).

Cases drawn from docs/research/youtube-add-flow.md section 1 — every documented URL
form, plus the documented pitfalls (playlist links, junk params, bad hosts).
"""

import pytest

from app.youtube.url import extract_video_id

VIDEO_ID = "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VIDEO_ID}",
        f"https://youtube.com/watch?v={VIDEO_ID}",
        f"https://m.youtube.com/watch?v={VIDEO_ID}",
        f"https://music.youtube.com/watch?v={VIDEO_ID}",
        f"http://www.youtube.com/watch?v={VIDEO_ID}",
        f"www.youtube.com/watch?v={VIDEO_ID}",  # no scheme
        f"https://www.youtube.com/watch?v={VIDEO_ID}&t=30s",
        f"https://www.youtube.com/watch?v={VIDEO_ID}&list=PLxyz&start_radio=1",
        f"https://youtu.be/{VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}?t=30",
        f"https://youtu.be/{VIDEO_ID}/",
        f"https://www.youtube.com/shorts/{VIDEO_ID}",
        f"https://www.youtube.com/embed/{VIDEO_ID}",
        f"https://www.youtube.com/live/{VIDEO_ID}",
        f"https://www.youtube.com/v/{VIDEO_ID}",
    ],
)
def test_extracts_video_id_from_every_documented_url_form(url: str) -> None:
    assert extract_video_id(url) == VIDEO_ID


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "not a url at all",
        "https://www.youtube.com/playlist?list=PLxyz",  # playlist, no single video
        "https://www.youtube.com/",  # homepage
        "https://www.youtube.com/@SomeChannel",  # channel handle
        "https://www.youtube.com/results?search_query=x",  # search results
        "https://vimeo.com/123456",  # wrong host entirely
        f"https://www.youtube.com/watch?v={VIDEO_ID[:-1]}",  # 10 chars, too short
        f"https://www.youtube.com/watch?v={VIDEO_ID}x",  # 12 chars, too long
        "https://www.youtube.com/watch?v=not!valid!",  # bad charset
        "https://www.youtube.com/watch",  # no v param
    ],
)
def test_rejects_urls_with_no_usable_single_video_id(url: str) -> None:
    assert extract_video_id(url) is None
