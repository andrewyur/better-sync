package routes

import (
	"fmt"
)

type RouteError struct {
	Err     error
	Context string
}

func newRouteError(err error, context string) error {
	if err != nil {
		return RouteError{
			Err:     err,
			Context: context,
		}
	}
	return nil
}

func (r RouteError) Error() string {
	return fmt.Sprintf("%s: %s", r.Context, r.Err.Error())
}
