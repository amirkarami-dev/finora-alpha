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
        // ServiceDefaults gives every HttpClient the standard resilience pipeline (10 s per
        // attempt, three retries, 30 s in total). A model answering with tool calls can take
        // longer than 10 s, a retry re-sends the whole conversation to a paid upstream, and the
        // pipeline's timeout is not an HttpRequestException, so it escaped ChatAsync as a 500.
        // The assistant runs on the plain client timeout below instead. The opt-out is marked
        // experimental (EXTEXP0001); suppressing that diagnostic is the documented way to use it.
#pragma warning disable EXTEXP0001
        services.AddHttpClient<AssistantClient>((sp, client) =>
        {
            var seconds = sp.GetRequiredService<IOptions<AssistantOptions>>().Value.TimeoutSeconds;
            client.Timeout = TimeSpan.FromSeconds(seconds);
        }).RemoveAllResilienceHandlers();
#pragma warning restore EXTEXP0001
        return services;
    }
}
