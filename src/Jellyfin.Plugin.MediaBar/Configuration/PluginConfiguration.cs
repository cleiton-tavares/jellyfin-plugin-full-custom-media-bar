using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.MediaBar.Configuration
{
    public enum MediaBarState
    {
        Disabled,
        Enabled,
    }

    public enum ContentMode
    {
        /// <summary>
        /// Original behaviour: the bar is populated from the Jellyfin library
        /// (random items, a playlist or the avatars list.txt file).
        /// </summary>
        Library,

        /// <summary>
        /// Fully custom behaviour: the bar shows the hand-curated items defined
        /// in <see cref="PluginConfiguration.CustomItems"/> (title, image, video
        /// or live broadcast). Used for things like a World Cup schedule.
        /// </summary>
        Custom,
    }

    public class PluginConfiguration : BasePluginConfiguration
    {
        public MediaBarState Enabled { get; set; } = MediaBarState.Enabled;

        public string VersionString { get; set; } = "main";

        public bool UseAvatarsFile { get; set; } = true;

        public string AvatarsPlaylist { get; set; } = string.Empty;

        /// <summary>
        /// Which source feeds the media bar. Defaults to the original library
        /// behaviour so existing installs are unaffected.
        /// </summary>
        public ContentMode ContentMode { get; set; } = ContentMode.Library;

        /// <summary>
        /// Hand-curated items shown when <see cref="ContentMode"/> is
        /// <see cref="ContentMode.Custom"/>.
        /// </summary>
        public List<CustomMediaItem> CustomItems { get; set; } = new List<CustomMediaItem>();

        public WebConfig WebConfig { get; set; } = new WebConfig();
    }

    /// <summary>
    /// A single fully customizable entry for the media bar. Everything is
    /// author-supplied so it does not need to exist in the Jellyfin library.
    /// </summary>
    public class CustomMediaItem
    {
        /// <summary>Main title shown on the slide (e.g. "Brasil x Argentina").</summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>Optional secondary line (e.g. "Grupo A • Estádio Maracanã").</summary>
        public string Subtitle { get; set; } = string.Empty;

        /// <summary>Optional longer description / plot text.</summary>
        public string Overview { get; set; } = string.Empty;

        /// <summary>Background (backdrop) image URL.</summary>
        public string BackgroundImageUrl { get; set; } = string.Empty;

        /// <summary>Optional logo image URL drawn over the background instead of the title text.</summary>
        public string LogoImageUrl { get; set; } = string.Empty;

        /// <summary>Optional badge text (e.g. "AO VIVO", "14:00", "Hoje").</summary>
        public string Badge { get; set; } = string.Empty;

        /// <summary>
        /// How the media should be played: "video" (mp4/webm/etc),
        /// "live" (HLS .m3u8 / live broadcast), "youtube" (YouTube or YouTube Live),
        /// "external" (open the URL in a new tab) or "none" (no play button).
        /// </summary>
        public string MediaType { get; set; } = "none";

        /// <summary>The URL of the video, live stream or YouTube link.</summary>
        public string MediaUrl { get; set; } = string.Empty;

        /// <summary>Optional custom label for the play button (defaults to a localized "Assistir"/"Watch").</summary>
        public string ButtonText { get; set; } = string.Empty;
    }

    public class WebConfig
    {
        public ImageSvgs ImageSvgs { get; set; } = new ImageSvgs();
        
        public int ShuffleInterval { get; set; } = -1;
        
        public int RetryInterval { get; set; } = -1;
        
        public int MinSwipeDistance { get; set; } = -1;
        
        public int LoadingCheckInterval { get; set; } = -1;
        
        public int MaxPlotLength { get; set; } = -1;

        public int MaxMovies { get; set; } = -1;
        
        public int MaxTvShows { get; set; } = -1;

        public int MaxItems { get; set; } = -1;

        public int PreloadCount { get; set; } = -1;
        
        public int FadeTransitionDuration { get; set; } = -1;

        public bool SlideAnimationEnabled { get; set; } = true;

        public bool EnableTrailers { get; set; } = true;
    }

    public class ImageSvgs
    {
        public string? ImdbLogo { get; set; } = null;

        public string? TomatoLogo { get; set; } = null;

        public string? FreshTomato { get; set; } = null;
        
        public string? RottenTomato { get; set; } = null;
    }
}