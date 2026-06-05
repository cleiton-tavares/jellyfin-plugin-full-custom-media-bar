using Jellyfin.Plugin.MediaBar.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.MediaBar
{
    public class MediaBarPlugin : BasePlugin<PluginConfiguration>, IHasPluginConfiguration, IHasWebPages
    {
        public override Guid Id => Guid.Parse("cda73f97-adfe-4af6-b875-d7a4addf4559");

        public override string Name => "Full Custom Media Bar";

        public static MediaBarPlugin Instance { get; private set; } = null!;
        
        public IServiceProvider ServiceProvider { get; }
        
        public MediaBarPlugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer, IServiceProvider serviceProvider) : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
            
            ServiceProvider = serviceProvider;
        }
        
        public IEnumerable<PluginPageInfo> GetPages()
        {
            string? prefix = GetType().Namespace;

            yield return new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = $"{prefix}.Configuration.config.html"
            };
        }
    }
}