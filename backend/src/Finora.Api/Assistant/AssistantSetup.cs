using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Finora.Api.Assistant;

public static class AssistantSetup
{
    public static IServiceCollection AddAssistant(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AssistantOptions>(configuration.GetSection(AssistantOptions.Section));
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<AssistantRateLimiter>();
        services.AddHttpClient<AssistantClient>((sp, client) =>
        {
            var seconds = sp.GetRequiredService<IOptions<AssistantOptions>>().Value.TimeoutSeconds;
            client.Timeout = TimeSpan.FromSeconds(seconds);
        });
        return services;
    }
}
